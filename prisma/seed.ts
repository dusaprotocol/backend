import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    for (let i = 0; i < 10; i++) {
        await prisma.tVL.create({
            data: {
                address: "AS1",
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * i),
                tvl: Math.random() * 1000,
            },
        });
        await prisma.volume.create({
            data: {
                address: "AS1",
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * i),
                volume: Math.random() * 1000,
            },
        });
        await prisma.swap.create({
            data: {
                poolAddress: "AS1",
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * i),
                amountIn: Math.random() * 1000,
                amountOut: Math.random() * 1000,
                tokenIn: "AS1",
                tokenOut: "AS2",
                txHash: Math.random().toString(36).substring(2, 15),
            },
        });
    }
}

main();
