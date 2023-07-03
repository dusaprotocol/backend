import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";

type Volume = Prisma.AnalyticsGetPayload<{
  select: {
    volume: true;
    date: true;
  };
}>;

type TVL = Prisma.AnalyticsGetPayload<{
  select: {
    usdLocked: true;
    date: true;
  };
}>;

type Analytics = Prisma.AnalyticsGetPayload<{
  select: {
    volume: true;
    usdLocked: true;
    date: true;
  };
}>;

type Price = Prisma.AnalyticsGetPayload<{
  select: {
    open: true;
    close: true;
    high: true;
    low: true;
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
            poolAddress: address,
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
          if (analytics.length === 0) return [];
          const res: Volume[] = [];

          let acc = 0;
          let date = analytics[0].date;
          analytics.forEach((analytic, i) => {
            if (
              date.getDay() !== analytic.date.getDay() ||
              i === analytics.length - 1
            ) {
              res.push({ date, volume: acc });
              acc = 0;
              date = analytic.date;
              return;
            }

            acc += Number(analytic.volume);
          });

          const nbEntriesToFill = take / 24 - res.length;
          const emptyEntries: Volume[] = Array.from(
            { length: nbEntriesToFill },
            (_, i) => ({
              volume: 0,
              date: new Date(
                res[res.length - 1].date.getTime() -
                  1000 * 60 * 60 * 24 * (i + 1)
              ),
            })
          );
          return res.concat(emptyEntries).reverse();
        })
        .catch((err) => {
          logger.error(err);
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
            poolAddress: address,
          },
          select: {
            token0Locked: true,
            token1Locked: true,
            usdLocked: true,
            date: true,
          },
          orderBy: {
            date: "desc",
          },
          take,
        })
        .then((analytics) => {
          if (analytics.length === 0) return [];
          const res: TVL[] = [];

          analytics.forEach((analytic, i) => {
            if (i % 24 === 0) {
              console.log(i);
              res.push(analytic);
            }
          });

          console.log(res.length);
          return res.reverse();
        })
        .catch((err) => {
          logger.error(err);
          return [];
        });
    }),
  getAnalytics: t.procedure
    .input(
      z.object({
        address: z.string(),
        take: z.number(),
      })
    )
    .output(
      z.array(
        z.object({ volume: z.number(), usdLocked: z.number(), date: z.date() })
      )
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      return ctx.prisma.analytics
        .findMany({
          where: {
            poolAddress: address,
          },
          select: {
            volume: true,
            usdLocked: true,
            date: true,
          },
          orderBy: {
            date: "desc",
          },
          take,
        })
        .then((analytics) => {
          if (analytics.length === 0) return [];
          const res: Analytics[] = [];

          let acc = 0;
          let date = analytics[0].date;
          analytics.forEach((analytic, i) => {
            if (
              date.getDay() !== analytic.date.getDay() ||
              i === analytics.length - 1
            ) {
              res.push({
                date,
                volume: acc,
                usdLocked: analytic.usdLocked,
              });
              acc = 0;
              date = analytic.date;
              return;
            }

            acc += Number(analytic.volume);
          });

          const nbEntriesToFill = take / 24 - res.length;
          const emptyEntries: Analytics[] = Array.from(
            { length: nbEntriesToFill },
            (_, i) => ({
              volume: 0,
              usdLocked: 0,
              date: new Date(
                res[res.length - 1].date.getTime() -
                  1000 * 60 * 60 * 24 * (i + 1)
              ),
            })
          );
          return res.concat(emptyEntries).reverse();
        })
        .catch((err) => {
          logger.error(err);
          return [];
        });
    }),
  get24H: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
    return ctx.prisma.analytics
      .findMany({
        where: {
          poolAddress: input,
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
        console.log({ fees, volume, feesPctChange, volumePctChange });
        return { fees, volume, feesPctChange, volumePctChange };
      })
      .catch((err) => {
        logger.error(err);
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
        .catch((err) => {
          logger.error(err);
          return [];
        });
    }),
  getRecentLiquidity: t.procedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      return ctx.prisma.liquidity
        .findMany({
          where: {
            poolAddress: input,
          },
          orderBy: {
            timestamp: "desc",
          },
          take: 10,
        })
        .catch((err) => {
          logger.error(err);
          return [];
        });
    }),
  getPrice: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        take: z.union([z.literal(288), z.literal(2016)], z.literal(8640)),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, take } = input;
      return ctx.prisma.analytics
        .findMany({
          where: {
            poolAddress,
          },
          orderBy: {
            date: "desc",
          },
          take,
        })
        .then((prices) => {
          if (take === 288) return prices.reverse();

          const res: Price[] = [];
          prices.reverse().forEach((price, i) => {
            const open = res[res.length - 1]?.close ?? price.open;
            if (true) {
              res.push({
                ...price,
                open,
              });
            }
          });
          return res;
        })
        .catch((err) => {
          logger.error(err);
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
      // cache request for 1 hour
      const ONE_HOUR_IN_SECONDS = 60 * 60;
      return {
        headers: {
          "cache-control": `stale-while-revalidate=${ONE_HOUR_IN_SECONDS}`,
        },
      };
    }
    return {};
  },
});

// export type definition of API
export type AppRouter = typeof appRouter;
