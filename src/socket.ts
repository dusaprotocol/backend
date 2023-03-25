import { bytesToStr, IDatastoreEntryInput, IEvent, strToBytes } from "@massalabs/massa-web3";
import { PrismaClient } from "@prisma/client";
import { web3Client } from "./client";
import { prisma } from "./db";

export function processNewEvents(events: IEvent[]) {
    events.forEach(async (event) => {
        const [keyword, data] = event.data.split(",");
        switch (keyword) {
            case "SWAP":
                processSwap(data);
                break;
            case "ADD_LIQUIDITY":
                processAddLiquidity(data);
                break;
            case "REMOVE_LIQUIDITY":
                processRemoveLiquidity(data);
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

async function processAddLiquidity(data: string) {
    const [token, amount, caller] = data.split(",");
    addTvl(token, Number(amount));
}

async function processRemoveLiquidity(data: string) {
    const [token, amount, caller] = data.split(",");
    addTvl(token, -Number(amount));
}

// COMMON PRISMA ACTIONS

async function addVolume(address: string, amount: number) {
    const date = new Date().toISOString().split("T")[0];
    await prisma.volume.upsert({
        where: {
            date_address: {
                address,
                date,
            },
        },
        update: {
            volume: {
                increment: amount,
            },
        },
        create: {
            address,
            volume: amount,
            date,
        },
    });
}

async function addTvl(address: string, amount: number) {
    const date = new Date().toISOString().split("T")[0];
    await prisma.tVL.upsert({
        where: {
            date_address: {
                address,
                date,
            },
        },
        update: {
            tvl: {
                increment: amount,
            },
        },
        create: {
            address,
            tvl: amount,
            date,
        },
    });
}
