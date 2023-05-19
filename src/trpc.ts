import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { string, z } from "zod";
import { prisma } from "./db";
import type { Price, Prisma } from "@prisma/client";

type Volume = Prisma.AnalyticsGetPayload<{
    select: {
        volume: true;
        date: true;
    };
}>;

type TVL = Prisma.AnalyticsGetPayload<{
    select: {
        tvl: true;
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
                        tvl: true,
                        date: true,
                    },
                    orderBy: {
                        date: "desc",
                    },
                    take,
                })
                .then((analytics) => {
                    const res: TVL[] = [];

                    let acc = 0;
                    let date = analytics[0].date;
                    analytics.forEach((analytic, i) => {
                        if (
                            date.getDay() !== analytic.date.getDay() ||
                            i === analytics.length - 1
                        ) {
                            res.push({ date, tvl: BigInt(acc) });
                            acc = 0;
                            date = analytic.date;
                            return;
                        }

                        acc += Number(analytic.tvl);
                    });

                    const nbEntriesToFill = take / 24 - res.length;
                    const emptyEntries = Array.from(
                        { length: nbEntriesToFill },
                        (_, i) => ({
                            tvl: BigInt(0),
                            date: new Date(
                                res[res.length - 1].date.getTime() -
                                    1000 * 60 * 60 * 24 * (i + 1)
                            ),
                        })
                    );
                    return res.concat(emptyEntries).reverse();
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
                const fees = today.reduce(
                    (acc, curr) => acc + Number(curr.fees),
                    0
                );
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
                    ((fees - feesYesterday) / (feesYesterday || 1)) * 100;
                const volumePctChange =
                    ((volume - volumeYesterday) / (volumeYesterday || 1)) * 100;
                return { fees, volume, feesPctChange, volumePctChange };
            });
    }),
    getRecentSwaps: t.procedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            return ctx.prisma.swap.findMany({
                where: {
                    poolAddress: input,
                },
                orderBy: {
                    timestamp: "desc",
                },
                take: 10,
            });
        }),
    getPrice: t.procedure
        .input(
            z.object({
                address: z.string(),
                take: z.number(),
            })
        )
        .query(async ({ input, ctx }) => {
            const { address, take } = input;
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
                    const res: Price[] = [];
                    prices.forEach((price, i) => {
                        if (take === 168) {
                            if (i % 6 === 0)
                                res.push({
                                    ...price,
                                    open: prices[prices.length - 1].open,
                                });
                            return;
                        }
                        if (take === 720) {
                            if (i % 24 === 0)
                                res.push({
                                    ...price,
                                    open: prices[prices.length - 1].open,
                                });
                            return;
                        }
                        res.push(price);
                    });
                    return res.reverse();
                });
        }),
});

export const expressMiddleware = trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
});

// export type definition of API
export type AppRouter = typeof appRouter;
