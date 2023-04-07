import * as trpcExpress from "@trpc/server/adapters/express";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { string, z } from "zod";
import { prisma } from "./db";

export const createContext = ({ req, res }: trpcExpress.CreateExpressContextOptions) => ({
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
            return ctx.prisma.volume.findMany({
                where: {
                    address,
                },
                take,
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
            return ctx.prisma.tVL.findMany({
                where: {
                    address,
                },
                take,
            });
        }),
    getRecentSwaps: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
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
    // getPoolDistribution: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
});

export const expressMiddleware = trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
});

// export type definition of API
export type AppRouter = typeof appRouter;
