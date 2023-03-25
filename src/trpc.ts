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
    getVolume: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
        return ctx.prisma.volume.findMany({
            where: {
                address: input,
            },
        });
    }),
    getTVL: t.procedure.input(z.string()).query(async ({ input, ctx }) => {
        return ctx.prisma.tVL.findMany({
            where: {
                address: input,
            },
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
});

export const expressMiddleware = trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
});

// export type definition of API
export type AppRouter = typeof appRouter;
