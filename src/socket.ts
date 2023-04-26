import { prisma } from "./db";

// EVENT PROCESSING

export async function processSwap(
    txHash: string,
    timestamp: string | Date,
    poolAddress: string,
    swapEvents: string[]
) {
    let binId = 0;
    let swapForY = false;
    let amountIn = 0;
    let amountOut = 0;

    swapEvents.forEach(async (event) => {
        const [
            to,
            _binId,
            _swapForY,
            _amountIn,
            _amountOut,
            volatilityAccumulated,
            totalFees,
        ] = event.split(",");

        binId = Number(_binId);
        swapForY = _swapForY === "true";
        amountIn += Number(_amountIn);
        amountOut += Number(_amountOut);
    });

    addVolume(poolAddress, Number(amountIn));
    await prisma.swap.create({
        data: {
            poolAddress,
            swapForY,
            binId,
            amountIn,
            amountOut,
            timestamp,
            txHash,
        },
    });
}

export async function processAddLiquidity(data: string) {
    const [token, amount, caller] = data.split(",");
    addTvl(token, Number(amount));
}

export async function processRemoveLiquidity(data: string) {
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
