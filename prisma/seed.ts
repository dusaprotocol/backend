import { Price, Prisma, PrismaClient, Swap, TVL, Volume } from "@prisma/client";
import { getPriceFromId } from "../src/methods";

const prisma = new PrismaClient();

const address = "AS124ifN6bDe67AaWanjRi1Lev1WtZZB35U49xD4VzjJFLP9igUNg";
const precision = 10 ** 9;
const binStep = 25;

async function generateVolumeAndTVL() {
    const dataVolume: Volume[] = [];
    const dataTVL: TVL[] = [];
    const dataSwap: Prisma.Enumerable<Prisma.SwapCreateManyInput> = [];

    let prevValue = 5000;
    for (let i = 0; i < 90; i++) {
        const value = Math.round(prevValue + Math.random() * 1000 - 500);
        const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);
        const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * i);

        dataTVL.push({
            address,
            date,
            tvl: value,
        });
        dataVolume.push({
            address,
            date,
            volume: value,
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

    prisma.tVL
        .createMany({
            data: dataTVL,
        })
        .catch((err) => console.log(err));
    prisma.volume
        .createMany({
            data: dataVolume,
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

    let prevPrice = 1;
    for (let j = 0; j < 720; j++) {
        const price = prevPrice * (1 + Math.random() * 0.1 - 0.05);

        data.push({
            address,
            date: new Date(Date.now() - 1000 * 60 * 60 * j),
            open: prevPrice,
            close: price,
            high: Math.max(prevPrice, price) * (1 + Math.random() * 0.1),
            low: Math.min(prevPrice, price) * (1 - Math.random() * 0.1),
        });
        prevPrice = price;
        console.log(j);
    }

    await prisma.price
        .createMany({
            data,
        })
        .catch((err) => console.log(err));
}

async function main() {
    generateVolumeAndTVL();
    generatePrices();
}

main();
