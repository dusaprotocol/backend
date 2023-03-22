import { bytesToStr, IDatastoreEntryInput, IEvent, strToBytes } from "@massalabs/massa-web3";
import { PrismaClient } from "@prisma/client";
import { web3Client } from "./client";
import { prisma } from "./db";

function processNewEvents(events: IEvent[]) {
    events.forEach(async (event) => {
        const [keyword, data] = event.data.split(",");
        switch (keyword) {
            case "SWAP":
                processSwap(data);
                break;
            case "ADD_LIQUIDITY":
                break;
            default:
                break;
        }
    });
}

// EVENT PROCESSING

async function processSwap(data: string) {
    const [tokenIn, tokenOut, amountIn, amountOut, caller] = data.split(",");
    addVolume(tokenIn, Number(amountIn));
}

// COMMON PRISMA ACTIONS

async function addVolume(poolAddress: string, price: number) {
    const date = new Date().toISOString().split("T")[0];
    await prisma.history.upsert({
        where: {
            date_poolAddress: {
                poolAddress,
                date,
            },
        },
        update: {
            volume: {
                increment: price,
            },
        },
        create: {
            poolAddress,
            volume: price,
            tvl: 0, //TODO
            date,
        },
    });
}
