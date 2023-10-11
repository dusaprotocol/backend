import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { ONE_DAY, ONE_HOUR, TICKS_PER_DAY } from "../../common/utils/date";

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
                res[res.length - 1].date.getTime() - ONE_DAY * (i + 1)
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
              res.push(analytic);
            }
          });

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
                res[res.length - 1].date.getTime() - ONE_DAY * (i + 1)
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
          date: {
            // greater than 48h ago to calculate 24h change
            gt: new Date(Date.now() - ONE_DAY * 2),
          },
        },
        orderBy: {
          date: "desc",
        },
      })
      .then((analytics) => {
        const _24hago = new Date(Date.now() - ONE_DAY);

        const changeIndex = analytics.findIndex(
          (analytic) => analytic.date.getTime() < _24hago.getTime()
        );
        const today = analytics.slice(0, changeIndex);
        const yesterday = analytics.slice(changeIndex);

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
        return {
          fees,
          volume,
          feesPctChange,
          volumePctChange,
        };
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
  getProBanner24H: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        token0Address: z.string(),
        token1Address: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, token0Address, token1Address } = input;

      // Retrieve pools which include either token0 or token1
      const pools = await ctx.prisma.pool.findMany({
        where: {
          OR: [
            { token0Address },
            { token1Address },
            { token1Address: token0Address },
            { token0Address: token1Address },
          ],
        },
      });

      const calculateVolume = async (tokenAddress: string) => {
        const relevantPools = pools.filter(
          (pool) =>
            pool.token0Address === tokenAddress ||
            pool.token1Address === tokenAddress
        );
        const volumes = await Promise.all(
          relevantPools.map(async (pool) => {
            const swaps = await ctx.prisma.swap.findMany({
              where: {
                poolAddress: pool.address,
                timestamp: {
                  gt: new Date(Date.now() - ONE_DAY * 2),
                },
              },
              orderBy: {
                timestamp: "desc",
              },
            });

            const _24hAgo = new Date(Date.now() - ONE_DAY);
            const changeIndex = swaps.findIndex(
              (swap) => swap.timestamp.getTime() < _24hAgo.getTime()
            );

            const today = swaps.slice(0, changeIndex);
            const yesterday = swaps.slice(changeIndex);

            return {
              usdVolumeToday: today.reduce(
                (acc, curr) => acc + curr.usdValue,
                0
              ),
              usdVolumeYesterday: yesterday.reduce(
                (acc, curr) => acc + curr.usdValue,
                0
              ),
            };
          })
        );

        const totalVolumeToday = volumes.reduce(
          (acc, curr) => acc + curr.usdVolumeToday,
          0
        );
        const totalVolumeYesterday = volumes.reduce(
          (acc, curr) => acc + curr.usdVolumeYesterday,
          0
        );

        const usdVolumePctChange =
          totalVolumeYesterday === 0
            ? 0
            : ((totalVolumeToday - totalVolumeYesterday) /
                totalVolumeYesterday) *
              100;

        return {
          usdVolume: totalVolumeToday,
          usdVolumePctChange,
        };
      };

      const [usdVolumeToken0, usdVolumeToken1, highLowPrice] =
        await Promise.all([
          calculateVolume(token0Address),
          calculateVolume(token1Address),
          ctx.prisma.analytics
            .findMany({
              where: {
                poolAddress,
                date: { gt: new Date(Date.now() - ONE_DAY) },
              },
              orderBy: { date: "desc" },
            })
            .then((analytics) => {
              const _24hAgo = new Date(Date.now() - ONE_DAY);
              const today = analytics.filter(
                (analytic) => analytic.date.getTime() >= _24hAgo.getTime()
              );

              const high = today.reduce(
                (acc, curr) => Math.max(curr.high, acc),
                -Infinity
              );
              const low = today.reduce(
                (acc, curr) => Math.min(curr.low, acc),
                Infinity
              );

              const priceChange = today.length
                ? (today[today.length - 1].close - today[0].open) * -1
                : 0;
              const pricePctChange =
                today.length && today[0].open !== 0
                  ? priceChange / today[0].open
                  : 0;

              return { high, low, priceChange, pricePctChange };
            })
            .catch((err) => {
              logger.error(err);
              return { high: 0, low: 0, priceChange: 0, pricePctChange: 0 };
            }),
        ]);

      return {
        high: highLowPrice.high,
        low: highLowPrice.low,
        priceChange: highLowPrice.priceChange,
        pricePctChange: highLowPrice.pricePctChange,
        usdVolumeToken0: usdVolumeToken0.usdVolume,
        usdVolumeToken1: usdVolumeToken1.usdVolume,
        usdVolumePctChangeToken0: usdVolumeToken0.usdVolumePctChange,
        usdVolumePctChangeToken1: usdVolumeToken1.usdVolumePctChange,
      };
    }),
  getRecentSwaps: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        take: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, take } = input;
      return ctx.prisma.swap
        .findMany({
          where: {
            poolAddress,
          },
          orderBy: {
            timestamp: "desc",
          },
          take,
        })
        .catch((err) => {
          logger.error(err);
          return [];
        });
    }),
  getRecentLiquidity: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        take: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, take } = input;
      return ctx.prisma.liquidity
        .findMany({
          where: {
            poolAddress,
          },
          orderBy: {
            timestamp: "desc",
          },
          take,
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
        take: z.union([
          z.literal(1 * TICKS_PER_DAY),
          z.literal(7 * TICKS_PER_DAY),
          z.literal(30 * TICKS_PER_DAY),
        ]),
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
          const res: Price[] = [];

          // if take is 1 day, we want 24 points per day (24 total)
          // if take is 7 days, we want 4 points per day (28 total)
          // if take is 30 days, we want 1 point per day (30 total)
          const threshold =
            take === 1 * TICKS_PER_DAY
              ? TICKS_PER_DAY / 24
              : take === 7 * TICKS_PER_DAY
              ? (7 * TICKS_PER_DAY) / 28
              : (30 * TICKS_PER_DAY) / 30;

          let date = prices[0].date;
          prices.forEach((price, i) => {
            if (i % threshold === threshold - 1) {
              const slice = prices.slice(i + 1 - threshold, i + 1);
              res.push({
                ...price,
                close: res.length > 0 ? res[res.length - 1].open : price.open,
                high: Math.max(...slice.map((p) => p.high)),
                low: Math.min(...slice.map((p) => p.low)),
                date,
              });
              date = price.date;
              return;
            }
          });

          return res.reverse();
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
      return {
        headers: {
          "cache-control": `stale-while-revalidate=${ONE_HOUR / 1000}`,
        },
      };
    }
    return {};
  },
});

// export type definition of API
export type AppRouter = typeof appRouter;
