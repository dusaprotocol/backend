import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { string, z } from "zod";
import { prisma } from "../../common/db";
import type { Price, Prisma } from "@prisma/client";

type Volume = Prisma.AnalyticsGetPayload<{
  select: {
    volume: true;
    date: true;
  };
}>;

type TVL = Prisma.AnalyticsGetPayload<{
  select: {
    token0Locked: true;
    token1Locked: true;
    date: true;
  };
}>;

export const createContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => ({
  req,
  res,
  prisma,
});
export type Context = inferAsyncReturnType<typeof createContext>;

export const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  getVolume: t.procedure
    .input(
      z.object({
        address: z.string(),
        take: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      return ctx.prisma.analytics
        .findMany({
          where: {
            address,
          },
          select: {
            volume: true,
            date: true,
          },
          orderBy: {
            date: "desc",
          },
          take,
        })
        .then((analytics) => {
          if (analytics.length === 0) 
            return [];
          const res: Volume[] = [];

          let acc = 0;
          let date = analytics[0].date;
          analytics.forEach((analytic, i) => {
            if (
              date.getDay() !== analytic.date.getDay() ||
              i === analytics.length - 1
            ) {
              res.push({ date, volume: BigInt(acc) });
              acc = 0;
              date = analytic.date;
              return;
            }

            acc += Number(analytic.volume);
          });

          const nbEntriesToFill = take / 24 - res.length;
          const emptyEntries = Array.from(
            { length: nbEntriesToFill },
            (_, i) => ({
              volume: BigInt(0),
              date: new Date(
                res[res.length - 1].date.getTime() -
                  1000 * 60 * 60 * 24 * (i + 1)
              ),
            })
          );
          return res.concat(emptyEntries).reverse();
        })
        .catch((e) => {
          console.log(e);
          return [];
        });
    }),
  getTVL: t.procedure
    .input(
      z.object({
        address: z.string(),
        take: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      return ctx.prisma.analytics
        .findMany({
          where: {
            address,
          },
          select: {
            token0Locked: true,
            token1Locked: true,
            date: true,
          },
          orderBy: {
            date: "desc",
          },
          take,
        })
        .then((analytics) => {
          if (analytics.length === 0)
            return [];
          const res: TVL[] = [];

          let acc = [0, 0];
          let date = analytics[0].date;
          analytics.forEach((analytic, i) => {
            const nextDay =
              date.getDay() !== analytic.date.getDay() ||
              i === analytics.length - 1;
            if (nextDay) {
              res.push({
                date,
                token0Locked: BigInt(acc[0]),
                token1Locked: BigInt(acc[1]),
              });
              acc = [0, 0];
              date = analytic.date;
              return;
            }

            acc[0] += Number(analytic.token0Locked);
            acc[1] += Number(analytic.token1Locked);
          });

          const nbEntriesToFill = take / 24 - res.length;
          const emptyEntries: TVL[] = Array.from(
            { length: nbEntriesToFill },
            (_, i) => ({
              token0Locked: BigInt(0),
              token1Locked: BigInt(0),
              date: new Date(
                res[res.length - 1].date.getTime() -
                  1000 * 60 * 60 * 24 * (i + 1)
              ),
            })
          );
          return res.concat(emptyEntries).reverse();
        })
        .catch((e) => {
          console.log(e);
          return [];
        });
    }),
  get24H: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
    return ctx.prisma.analytics
      .findMany({
        where: {
          address: input,
        },
        orderBy: {
          date: "desc",
        },
        take: 48,
      })
      .then((analytics) => {
        const today = analytics.slice(0, 24);
        const yesterday = analytics.slice(24, 48);
        const fees = today.reduce((acc, curr) => acc + Number(curr.fees), 0);
        const feesYesterday = yesterday.reduce(
          (acc, curr) => acc + Number(curr.fees),
          0
        );
        const volume = today.reduce(
          (acc, curr) => acc + Number(curr.volume),
          0
        );
        const volumeYesterday = yesterday.reduce(
          (acc, curr) => acc + Number(curr.volume),
          0
        );
        const feesPctChange =
          feesYesterday === 0
            ? 0
            : ((fees - feesYesterday) / feesYesterday) * 100;
        const volumePctChange =
          volumeYesterday === 0
            ? 0
            : ((volume - volumeYesterday) / volumeYesterday) * 100;
        return { fees, volume, feesPctChange, volumePctChange };
      })
      .catch((e) => {
        console.log(e);
        return {
          fees: 0,
          volume: 0,
          feesPctChange: 0,
          volumePctChange: 0,
        };
      });
  }),
  getRecentSwaps: t.procedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      return ctx.prisma.swap
        .findMany({
          where: {
            poolAddress: input,
          },
          orderBy: {
            timestamp: "desc",
          },
          take: 10,
        })
        .catch((e) => {
          console.log(e);
          return [];
        });
    }),
  getPrice: t.procedure
    .input(
      z.object({
        address: z.string(),
        take: z.union([z.literal(24), z.literal(168), z.literal(720)]),
      })
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      console.log(address, take);
      return ctx.prisma.price
        .findMany({
          where: {
            address,
          },
          orderBy: {
            date: "desc",
          },
          take,
        })
        .then((prices) => {
          if (take === 24) return prices.reverse();

          const res: Price[] = [];
          prices.reverse().forEach((price, i) => {
            const open = res[res.length - 1]?.close ?? price.open;
            if (
              (take === 168 && i % 6 === 0) ||
              (take === 720 && i % 24 === 0)
            ) {
              res.push({
                ...price,
                open,
              });
            }
          });
          return res;
        })
        .catch((e) => {
          console.log(e);
          return [];
        });
    }),
});

export const expressMiddleware = trpcExpress.createExpressMiddleware({
  router: appRouter,
  createContext,
  responseMeta(opts) {
    const { ctx, paths, errors, type } = opts;
    // checking that no procedures errored
    const allOk = errors.length === 0;
    // checking we're doing a query request
    const isQuery = type === "query";
    if (ctx?.res && allOk && isQuery) {
      console.log("setting cache");
      // cache request for 1 day
      const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
      return {
        headers: {
          "cache-control": `stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
        },
      };
    }
    return {};
  },
});

// export type definition of API
export type AppRouter = typeof appRouter;
