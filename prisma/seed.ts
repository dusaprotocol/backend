import { Analytics, Price, Prisma, PrismaClient } from "@prisma/client";
import { getPriceFromId } from "../src/methods";
import { getActivePrice } from "../src/socket";

const prisma = new PrismaClient();

interface Pool {
    address: string;
    binStep: number;
    activeId: number;
}

const pools: Pool[] = [
    {
        address: "AS129LnZTYzWwXhBT6tVHbVTQRHPdB4PRdaV8nzRUBLBL647i1KMZ",
        binStep: 10,
        activeId: 123559,
    },
    {
        // USDC-MASSA
        address: "AS12Gnt1pVQJ4ip4DRRLmdusGj3wVjkA9NVpCKP1qs8CyzCgbWwHF",
        binStep: 20,
        activeId: 130266,
    },
    {
        // MASSA-WETH
        address: "AS128hN9i7DRCcFTmY4LVErFoHR2omShNiQPu662JoEAbWx4CEMF1",
        binStep: 15,
        activeId: 127136,
    },
];
const precision = 10 ** 9;

async function generateAnalytics(pool: Pool) {
    const data: Analytics[] = [];
    const dataSwap: Prisma.Enumerable<Prisma.SwapCreateManyInput> = [];

    let prevValue = 5000;
    for (let i = 0; i < 720; i++) {
        const value = Math.abs(
            Math.round(prevValue + Math.random() * 1000 - 250)
        );
        const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);
        const date = new Date(Date.now() - 1000 * 60 * 60 * i);
        date.setUTCHours(date.getHours(), 0, 0, 0);

        data.push({
            address: pool.address,
            date,
            tvl: BigInt(value),
            volume: BigInt(value),
            fees: BigInt(Math.round(value / 1000)),
        });
        dataSwap.push({
            poolAddress: pool.address,
            swapForY: Math.random() > 0.5,
            timestamp: date,
            binId,
            amountIn: BigInt(Math.floor(Math.random() * 10 * precision)),
            amountOut: BigInt(Math.floor(Math.random() * 10 * precision)),
            txHash: Math.random().toString(36).substring(2, 15),
        });

        prevValue = value;
    }

    prisma.analytics
        .createMany({
            data,
        })
        .catch((err) => console.log(err));
    // prisma.swap
    //     .createMany({
    //         data: dataSwap,
    //     })
    //     .catch((err) => console.log(err));
}

async function generatePrices(pool: Pool) {
    const data: Price[] = [];

    let prevPrice = await getActivePrice(pool.address, pool.binStep);
    for (let j = 0; j < 720; j++) {
        const price = prevPrice * (1 + Math.random() * 0.1 - 0.05);
        const date = new Date(Date.now() - 1000 * 60 * 60 * j);
        date.setUTCHours(date.getHours(), 0, 0, 0);

        data.push({
            address: pool.address,
            date,
            open: price,
            close: prevPrice,
            high: Math.max(prevPrice, price) * (1 + Math.random() * 0.1),
            low: Math.min(prevPrice, price) * (1 - Math.random() * 0.1),
        });
        prevPrice = price;
    }

    await prisma.price
        .createMany({
            data,
        })
        .catch((err) => console.log(err));
}

async function main() {
    for (const pool of pools) {
        generateAnalytics(pool);
        generatePrices(pool);
    }
}

main();
