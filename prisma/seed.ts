import { Analytics, Price, Prisma, PrismaClient } from "@prisma/client";
import { getPriceFromId } from "../src/methods";
import { getActivePrice } from "../src/socket";

const prisma = new PrismaClient();

const address = "AS12wTGqjCqaFMmvGuBqKHPdiBhsFkcazFfXvUgaDW4dq4pj16ZxB";
const precision = 10 ** 9;
const binStep = 15;

async function generateAnalytics() {
    const data: Analytics[] = [];
    const dataSwap: Prisma.Enumerable<Prisma.SwapCreateManyInput> = [];

    let prevValue = 5000;
    for (let i = 0; i < 720; i++) {
        const value = Math.round(prevValue + Math.random() * 1000 - 500);
        const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);
        const date = new Date(Date.now() - 1000 * 60 * 60 * i);

        data.push({
            address,
            date,
            tvl: BigInt(value),
            volume: BigInt(value),
            fees: BigInt(value / 1000),
        });
        dataSwap.push({
            poolAddress: address,
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
    prisma.swap
        .createMany({
            data: dataSwap,
        })
        .catch((err) => console.log(err));
}

async function generatePrices() {
    const data: Price[] = [];

    let prevPrice = await getActivePrice(address, binStep);
    for (let j = 0; j < 720; j++) {
        const price = prevPrice * (1 + Math.random() * 0.1 - 0.05);

        data.push({
            address,
            date: new Date(Date.now() - 1000 * 60 * 60 * j),
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
    generateAnalytics();
    generatePrices();
}

main();
