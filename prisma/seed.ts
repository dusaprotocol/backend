import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const address = "AS12vbk3pEsoieyJSbhv4uU4sW6TG3C2u99yhrZWvTpayNpX3bqmS";
    const precision = 10 ** 9;

    let prevValue = 5000;
    for (let i = 0; i < 90; i++) {
        const value = Math.round(prevValue + Math.random() * 1000 - 500);

        const promise1 = prisma.tVL.create({
            data: {
                address,
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * i),
                tvl: value,
            },
        });
        const promise2 = prisma.volume.create({
            data: {
                address,
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * i),
                volume: value,
            },
        });
        const promise3 = prisma.swap.create({
            data: {
                poolAddress: address,
                swapForY: Math.random() > 0.5,
                timestamp: new Date(Date.now() - 1000 * 60 * 10 * i),
                binId: Math.round(2 ** 17 - 50 + Math.random() * 50),
                amountIn: Math.floor(Math.random() * 10 * precision),
                amountOut: Math.floor(Math.random() * 10 * precision),
                txHash: Math.random().toString(36).substring(2, 15),
            },
        });

        await Promise.all([promise1, promise2, promise3]);
        console.log(i);
        prevValue = value;
    }
}

main();
