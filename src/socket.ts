import { Args, strToBytes } from "@massalabs/massa-web3";
import { web3Client } from "./client";
import { prisma } from "./db";
import { getBinStep, getPriceFromId } from "./methods";

// EVENT PROCESSING

export function processSwap(
    txHash: string,
    timestamp: string | Date,
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    swapEvents: string[]
) {
    getBinStep(poolAddress).then((binStep) => {
        if (!binStep) return;

        let binId = 0;
        let price = 0;
        let swapForY = false;
        let amountIn = 0;
        let amountOut = 0;
        let totalFees = 0;

        swapEvents.forEach((event) => {
            const [
                to,
                _binId,
                _swapForY,
                _amountIn,
                _amountOut,
                volatilityAccumulated,
                _totalFees,
            ] = event.split(",");

            binId = Number(_binId);
            price = getPriceFromId(binId, binStep);
            swapForY = _swapForY === "true";
            amountIn += Number(_amountIn);
            amountOut += Number(_amountOut);
            totalFees += Number(_totalFees);
        });

        console.log({ totalFees });
        getActivePrice(poolAddress, binStep).then((activePrice) => {
            console.log({ activePrice, price });
            const value = amountIn * (swapForY ? activePrice : 1 / activePrice);
            addVolume(poolAddress, value);
        });
        addPrice(poolAddress, price);

        prisma.swap
            .create({
                data: {
                    poolAddress,
                    swapForY,
                    binId,
                    amountIn,
                    amountOut,
                    timestamp,
                    txHash,
                },
            })
            .then((e) => console.log(e))
            .catch((e) => console.log(e));
    });
}

export function processLiquidity(
    poolAddress: string,
    tokenX: string,
    tokenY: string,
    events: string[],
    isAddLiquidity: boolean
) {
    getBinStep(poolAddress).then((binStep) => {
        if (!binStep) return;

        let amountX = 0;
        let amountY = 0;

        events.forEach((event) => {
            const [to, _binId, _amountX, _amountY] = event.split(",");

            amountX += Number(_amountX);
            amountY += Number(_amountY);
        });

        getActivePrice(poolAddress, binStep).then((price) => {
            const value =
                (price * amountX) / 10 ** 9 + amountY / 10 ** 9 / price;
            console.log({ price, value, amountX, amountY });
            addTvl(poolAddress, isAddLiquidity ? value : -value);
        });
    });
}

// COMMON PRISMA ACTIONS

function addVolume(address: string, amount: number) {
    const date = new Date();
    date.setUTCHours(date.getHours(), 0, 0, 0);

    prisma.analytics
        .upsert({
            where: {
                date_address: {
                    address,
                    date,
                },
            },
            update: {
                volume: {
                    increment: Math.round(amount),
                },
            },
            create: {
                address,
                date,
                volume: Math.round(amount),
                feesIn: 0,
                feesOut: 0,
                tvl: 0,
            },
        })
        .then((e) => console.log(e))
        .catch((e) => console.log(e));
}

function addTvl(address: string, amount: number) {
    const date = new Date();
    date.setUTCHours(date.getHours(), 0, 0, 0);

    prisma.analytics
        .upsert({
            where: {
                date_address: {
                    address,
                    date,
                },
            },
            update: {
                tvl: {
                    increment: Math.round(amount),
                },
            },
            create: {
                address,
                date,
                volume: 0,
                feesIn: 0,
                feesOut: 0,
                tvl: Math.round(amount),
            },
        })
        .then((e) => console.log(e))
        .catch((e) => console.log(e));
}

function addPrice(address: string, price: number) {
    const date = new Date();
    date.setUTCHours(date.getHours(), 0, 0, 0);

    console.log({ price });

    prisma.price
        .findUnique({
            where: {
                date_address: {
                    address,
                    date,
                },
            },
        })
        .then((curr) => {
            if (!curr) {
                prisma.price
                    .create({
                        data: {
                            address,
                            open: price,
                            high: price,
                            low: price,
                            close: price,
                            date,
                        },
                    })
                    .then((e) => console.log(e))
                    .catch((e) => console.log(e));
                return;
            }

            prisma.price
                .update({
                    where: {
                        date_address: {
                            address,
                            date,
                        },
                    },
                    data: {
                        high: {
                            set: curr.high < price ? price : undefined,
                        },
                        low: {
                            set: curr.low > price ? price : undefined,
                        },
                    },
                })
                .then((e) => console.log(e))
                .catch((e) => console.log(e));
        });
}

// MISC

export const getActivePrice = (
    poolAddress: string,
    binStep: number
): Promise<number> =>
    web3Client
        .publicApi()
        .getDatastoreEntries([
            {
                address: poolAddress,
                key: strToBytes("PAIR_INFORMATION"),
            },
        ])
        .then((r) => {
            const data = r[0].final_value;
            if (!data) return 0;

            const args = new Args(data);
            const activeId = args.nextU32();
            console.log({ activeId, binStep });
            return getPriceFromId(activeId, binStep);
        });
