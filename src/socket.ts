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

        swapEvents.forEach((event) => {
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
            price = getPriceFromId(binId, binStep);
            swapForY = _swapForY === "true";
            amountIn += Number(_amountIn);
            amountOut += Number(_amountOut);
        });

        addVolume(poolAddress, getTokenValue(tokenIn) * amountIn);
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

export function processAddLiquidity(
    poolAddress: string,
    tokenX: string,
    tokenY: string,
    addEvents: string[]
) {
    getBinStep(poolAddress).then((binStep) => {
        if (!binStep) return;

        let binId = 0;
        let price = 0;
        let amountX = 0;
        let amountY = 0;

        addEvents.forEach((event) => {
            const [to, _binId, _amountX, _amountY] = event.split(",");

            binId = Number(_binId);
            price = getPriceFromId(binId, binStep);
            amountX += Number(_amountX);
            amountY += Number(_amountY);
        });

        const value =
            getTokenValue(tokenX) * amountX + getTokenValue(tokenY) * amountY;
        addTvl(poolAddress, Number(value));
    });
}

export function processRemoveLiquidity(data: string) {
    const [token, amount, caller] = data.split(",");
    addTvl(token, -Number(amount));
}

// COMMON PRISMA ACTIONS

function addVolume(address: string, amount: number) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    prisma.volume
        .upsert({
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
        })
        .then((e) => console.log(e))
        .catch((e) => console.log(e));
}

function addTvl(address: string, amount: number) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    prisma.tVL
        .upsert({
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
        })
        .then((e) => console.log(e))
        .catch((e) => console.log(e));
}

function addPrice(address: string, price: number) {
    const date = new Date();
    date.setUTCHours(date.getHours(), 0, 0, 0);

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

function getTokenValue(token: string): number {
    return 1;
}
