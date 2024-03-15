import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Liquidity, Prisma, Swap } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { ONE_DAY, ONE_HOUR, TICKS_PER_DAY } from "../../common/utils/date";
import { calculateStreak, toToken } from "../../common/methods";
import { getTokenValue } from "../../common/datastoreFetcher";

const DayWindow = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
  z.literal(180),
]);

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

type Price = Prisma.AnalyticsGetPayload<{
  select: {
    open: true;
    close: true;
    high: true;
    low: true;
    date: true;
  };
}>;

type Leaderboard = Prisma.MakerGetPayload<{
  select: {
    address: true;
    accruedFeesUsd: true;
    volume: true;
  };
}> & {
  feesPct: number;
};

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
        take: DayWindow,
      })
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      return ctx.prisma.analytics
        .findMany({
          select: {
            volume: true,
            date: true,
          },
          where: {
            poolAddress: address,
          },
          orderBy: {
            date: "desc",
          },
          take: take * TICKS_PER_DAY,
        })
        .then((analytics) => {
          const res: Volume[] = [];
          if (analytics.length === 0) return res;

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

            acc += analytic.volume;
          });

          // const nbEntriesToFill = take / 24 - res.length;
          // const emptyEntries: Volume[] = Array.from(
          //   { length: nbEntriesToFill },
          //   (_, i) => ({
          //     volume: 0,
          //     date: new Date(
          //       res[res.length - 1].date.getTime() - ONE_DAY * (i + 1)
          //     ),
          //   })
          // );
          return res.reverse();
        })
        .catch((err): Volume[] => {
          logger.error(err);
          return [];
        });
    }),
  getTVL: t.procedure
    .input(
      z.object({
        address: z.string(),
        take: DayWindow,
      })
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      return ctx.prisma.analytics
        .findMany({
          select: {
            usdLocked: true,
            date: true,
          },
          where: {
            poolAddress: address,
          },
          orderBy: {
            date: "desc",
          },
          take: take * TICKS_PER_DAY,
        })
        .then((analytics) => {
          const res: TVL[] = [];
          if (analytics.length === 0) return res;

          analytics.forEach((analytic, i) => {
            if (i % TICKS_PER_DAY === 0) {
              res.push(analytic);
            }
          });

          return res.reverse();
        })
        .catch((err): TVL[] => {
          logger.error(err);
          return [];
        });
    }),
  getBinsTraded: t.procedure
    .input(
      z.object({
        address: z.string(),
        take: DayWindow,
      })
    )
    .query(async ({ input, ctx }) => {
      const { address, take } = input;
      return ctx.prisma.bin
        .groupBy({
          by: ["binId"],
          where: {
            poolAddress: address,
            date: {
              gt: new Date(Date.now() - ONE_DAY * take),
            },
          },
          _sum: {
            volumeUsd: true,
          },
        })
        .then((analytics) => {
          return analytics.map((a) => ({
            binId: a.binId,
            volumeUsd: a._sum.volumeUsd || 0,
          }));
        });
      // .catch((err): BinTraded[] => {
      //   logger.error(err);
      //   return [];
      // });
    }),
  get24H: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
    return ctx.prisma.analytics
      .findMany({
        select: {
          volume: true,
          fees: true,
          date: true,
        },
        where: {
          poolAddress: input,
          date: {
            gt: new Date(Date.now() - ONE_DAY * 2), // greater than 48h ago to calculate 24h change
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

        const reduce = (
          arr: (Volume & { fees: number })[],
          key: "volume" | "fees"
        ) => arr.reduce((acc, curr) => acc + Number(curr[key]), 0);

        const getChange = (today: number, yesterday: number) =>
          yesterday === 0 ? 0 : ((today - yesterday) / yesterday) * 100;

        const fees = reduce(today, "fees");
        const feesYesterday = reduce(yesterday, "fees");
        const volume = reduce(today, "volume");
        const volumeYesterday = reduce(yesterday, "volume");
        const feesPctChange = getChange(fees, feesYesterday);
        const volumePctChange = getChange(volume, volumeYesterday);

        return {
          fees,
          volume,
          feesPctChange,
          volumePctChange,
        };
      })
      .catch((err) => {
        logger.error(err.message);
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
        select: { address: true, token0Address: true, token1Address: true },
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
              select: {
                date: true,
                high: true,
                low: true,
                close: true,
                open: true,
              },
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
              logger.error(err.toString());
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
        take: z.number().lte(100),
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
        .catch((err): Swap[] => {
          logger.error(err);
          return [];
        });
    }),
  getRecentLiquidity: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        take: z.number().lte(100),
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
        .catch((err): Liquidity[] => {
          logger.error(err);
          return [];
        });
    }),
  getPrice: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        take: z.union([z.literal(1), z.literal(7), z.literal(30)]),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, take } = input;
      return ctx.prisma.analytics
        .findMany({
          select: {
            open: true,
            close: true,
            high: true,
            low: true,
            date: true,
          },
          where: {
            poolAddress,
          },
          orderBy: {
            date: "desc",
          },
          take: take * TICKS_PER_DAY,
        })
        .then((prices) => {
          const res: Price[] = [];

          // if take is 1 day, we want 24 points per day (24 total)
          // if take is 7 days, we want 4 points per day (28 total)
          // if take is 30 days, we want 1 point per day (30 total)
          const threshold =
            take === 1
              ? TICKS_PER_DAY / 24
              : take === 7
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
        .catch((err): Price[] => {
          logger.error(err);
          return [];
        });
    }),
  getDCAs: t.procedure
    .input(
      z.object({
        userAddress: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { userAddress } = input;
      return ctx.prisma.dCA
        .findMany({
          where: {
            userAddress,
          },
          include: {
            execution: true,
          },
        })
        .catch(
          (err): Prisma.DCAGetPayload<{ include: { execution: true } }>[] => {
            logger.error(err);
            return [];
          }
        );
    }),
  getOrders: t.procedure
    .input(
      z.object({
        userAddress: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { userAddress } = input;
      return ctx.prisma.order
        .findMany({
          where: {
            userAddress,
          },
          include: {
            orderExecution: true,
          },
        })
        .catch(
          (
            err
          ): Prisma.OrderGetPayload<{
            include: { orderExecution: true };
          }>[] => {
            logger.error(err);
            return [];
          }
        );
    }),
  getGlobalVolume: t.procedure
    .input(z.object({ take: DayWindow }))
    .query(async ({ input, ctx }) => {
      const { take } = input;
      return ctx.prisma.$queryRaw<Volume[]>`
          SELECT SUM(volume) as volume, DATE(date) as date
          FROM Analytics
          WHERE date > DATE_SUB(NOW(), INTERVAL ${take} DAY)
          GROUP BY DATE(Analytics.date);`;
    }),
  getGlobalTVL: t.procedure
    .input(z.object({ take: DayWindow }))
    .query(async ({ input, ctx }) => {
      const { take } = input;
      return ctx.prisma.$queryRaw<TVL[]>`
        SELECT date, SUM(usdLocked) AS usdLocked
        FROM (
          SELECT date, poolAddress, usdLocked, ROW_NUMBER() OVER (PARTITION BY poolAddress, DATE(date) ORDER BY date DESC) as rn
          FROM Analytics
        ) AS ranked
        WHERE rn = 1 AND date > DATE_SUB(NOW(), INTERVAL ${take} DAY)
        GROUP BY date;`;
    }),
  getDashboard: t.procedure
    .input(z.object({}).optional())
    .query(async ({ input, ctx }) => {
      // WALLETS

      const uniqueWallets = 0; //swapWallets + liquidityWallets;

      // VOLUME/FEES
      const { volume: totalVolume, fees: totalFees } = await getVolumeFees();
      const { volume: weeklyVolume, fees: weeklyFees } = await getVolumeFees(
        new Date(Date.now() - ONE_DAY * 7)
      );
      const { volume: dailyVolume, fees: dailyFees } = await getVolumeFees(
        new Date(Date.now() - ONE_DAY)
      );

      // TVL
      const totalTVL = await ctx.prisma.$queryRaw<{ totalTVL: number }[]>`
        SELECT SUM(sub.usdLocked) AS totalTVL
        FROM (
            SELECT poolAddress, usdLocked
            FROM Analytics
            WHERE (poolAddress, date) IN (
                SELECT poolAddress, MAX(date) AS latest_date
                FROM Analytics
                GROUP BY poolAddress
            )
        ) AS sub;
      `.then((res) => res[0].totalTVL);
      const athTVL = await ctx.prisma.$queryRaw<{ athTVL: number }[]>`
      SELECT MAX(daily_sum_usdLocked) AS athTVL
FROM (
    SELECT date, SUM(usdLocked) AS daily_sum_usdLocked
    FROM Analytics
    GROUP BY date
) AS sub;
      `.then((res) => res[0].athTVL);

      return {
        uniqueWallets,
        athTVL,
        totalTVL,
        totalVolume,
        totalFees,
        weeklyVolume,
        weeklyFees,
        dailyVolume,
        dailyFees,
      };
    }),
  getTokenValue: t.procedure
    .input(
      z.object({
        tokenAddress: z.string(),
        tokenDecimals: z.number(),
      })
    )
    .query(async ({ input }) => {
      const { tokenAddress, tokenDecimals } = input;
      const token = toToken({ address: tokenAddress, decimals: tokenDecimals });
      return getTokenValue(token);
    }),
  getLeaderboard: t.procedure
    .input(
      z.object({
        from: z.string().transform((v) => new Date(v)),
        to: z.string().transform((v) => new Date(v)),
        poolAddress: z.string(),
        take: z.number().min(1).max(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, from, to, take } = input;
      return ctx.prisma.$queryRaw<Leaderboard[]>`
        SELECT address, SUM(accruedFeesUsd) as accruedFeesUsd, SUM(volume) as volume, SUM(accruedFeesUsd) / (SELECT SUM(accruedFeesUsd) FROM Maker WHERE poolAddress = ${poolAddress} AND date BETWEEN ${from} AND ${to}) * 100 as feesPct
        FROM Maker
        WHERE poolAddress = ${poolAddress}
        AND date BETWEEN ${from} AND ${to}
        GROUP BY address
        ORDER BY accruedFeesUsd DESC
        LIMIT ${take};
      `.catch((err): Leaderboard[] => {
        logger.error(err);
        return [];
      });
    }),
  getStreak: t.procedure
    .input(
      z.object({
        poolAddress: z.string(),
        address: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { poolAddress, address } = input;
      const res = await ctx.prisma.maker.findMany({
        where: {
          address,
          poolAddress,
        },
        orderBy: {
          date: "desc",
        },
      });

      return {
        streak: calculateStreak(res),
        lastDate: res[0]?.date,
      };
    }),
  getRewardPool: t.procedure
    .input(
      z.object({
        epoch: z.number(),
        poolAddress: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { epoch, poolAddress } = input;
      const res = await ctx.prisma.rewardPool.findUniqueOrThrow({
        where: {
          poolAddress_epoch: {
            epoch,
            poolAddress,
          },
        },
        include: {
          rewardTokens: {
            include: {
              token: true,
            },
          },
        },
      });

      const rewardTokensWithValue = await Promise.all(
        res.rewardTokens.map(async (rewardToken) => ({
          ...rewardToken,
          dollarValue: await getTokenValue(toToken(rewardToken.token)),
        }))
      );

      return {
        ...res,
        rewardTokens: rewardTokensWithValue,
      };
    }),
});

const getVolumeFees = async (date?: Date) => {
  return prisma.analytics
    .aggregate({
      _sum: {
        volume: true,
        fees: true,
      },
      where: {
        date: {
          gt: date,
        },
      },
    })
    .then((res) => {
      return {
        volume: res._sum.volume || 0,
        fees: res._sum.fees || 0,
      };
    });
};

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
