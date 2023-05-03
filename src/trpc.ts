import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { string, z } from "zod";
import { prisma } from "./db";
import type { Price } from "@prisma/client";

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
    getAnalytics: t.procedure
        .input(
            z.object({
                address: z.string(),
                take: z.number(),
            })
        )
        .query(async ({ input, ctx }) => {
            const { address, take } = input;
            return ctx.prisma.analytics.findMany({
                where: {
                    address,
                },
                take,
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
