import { bytesToStr, IDatastoreEntryInput, IEvent, strToBytes } from "@massalabs/massa-web3";
import { PrismaClient } from "@prisma/client";
import { web3Client } from "./client";
import { prisma } from "./db";

export function processNewEvents(events: IEvent[]) {
    events.forEach(async (event) => {
        const [keyword, data] = event.data.split(":");
        const call_stack = event.context.call_stack;
        const caller = call_stack[0];
        const callee = call_stack[call_stack.length - 1];
        const timestamp = new Date(); //event.context.slot;
        const txHash = event.context.origin_operation_id ?? "";
        switch (keyword) {
            case "SWAP":
                processSwap(txHash, timestamp, callee, data);
                break;
            case "DEPOSITED_TO_BIN":
                processAddLiquidity(data);
                break;
            case "WITHDRAWN_FROM_BIN":
                processRemoveLiquidity(data);
                break;
            default:
                break;
        }
    });
}

// EVENT PROCESSING

async function processSwap(txHash: string, timestamp: string | Date, poolAddress: string, data: string) {
    const [to, binId, swapForY, amountIn, amountOut, volatilityAccumulated, totalFees] = data.split(",");
    addVolume(poolAddress, Number(amountIn));
    await prisma.swap.create({
        data: {
            poolAddress,
            swapForY: swapForY === "true",
            binId: Number(binId),
            amountIn: Number(amountIn),
            amountOut: Number(amountOut),
            timestamp,
            txHash,
        },
    });
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
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

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
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

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
