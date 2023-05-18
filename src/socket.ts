import { Args, strToBytes } from "@massalabs/massa-web3";
import { web3Client } from "./client";
import { prisma } from "./db";
import { getBinStep, getPriceFromId } from "./methods";
import { Prisma } from "@prisma/client";
import { factorySC, usdcSC } from "./contracts";

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

        getTokenValue(tokenIn).then((valueIn) => {
            if (!valueIn) return;

            const volume = Math.round((amountIn / 10 ** 9) * valueIn);
            const fees = Math.round((totalFees / 10 ** 9) * valueIn * 100); // fees are stored in cents
            addVolume(poolAddress, volume, fees);
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
            // .then((e) => console.log(e))
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

function addVolume(address: string, volume: number, fees: number) {
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
                    increment: volume,
                },
                fees: {
                    increment: fees,
                },
            },
            create: {
                address,
                date,
                volume,
                fees,
                tvl: 0,
            },
        })
        // .then((e) => console.log(e))
        .catch((e) => console.log(e));
}

function addTvl(address: string, tvl: number) {
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
                    increment: tvl,
                },
            },
            create: {
                address,
                date,
                volume: 0,
                fees: 0,
                tvl,
            },
        })
        // .then((e) => console.log(e))
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
                    // .then((e) => console.log(e))
                    .catch((e) => console.log(e));
                return;
            }

            const data: Prisma.PriceUpdateInput = {
                close: price,
            };
            if (price > curr.high) data.high = price;
            if (price < curr.low) data.low = price;

            prisma.price
                .update({
                    where: {
                        date_address: {
                            address,
                            date,
                        },
                    },
                    data,
                })
                // .then((e) => console.log(e))
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
            return getPriceFromId(activeId, binStep);
        });

export const fetchPairBinSteps = async (
    token0: string,
    token1: string
): Promise<number[]> =>
    web3Client
        .smartContracts()
        .readSmartContract({
            fee: BigInt(1_000_000),
            targetAddress: factorySC,
            targetFunction: "getAvailableLBPairBinSteps",
            maxGas: BigInt(100_000_000),
            parameter: new Args()
                .addString(token0)
                .addString(token1)
                .serialize(),
        })
        .then((res) => {
            return res.info.output_events[0]?.data.split(",").map(Number);
        });

export const fetchPairAddress = async (
    token0: string,
    token1: string,
    binStep: number
): Promise<string | undefined> =>
    web3Client
        .smartContracts()
        .readSmartContract({
            fee: BigInt(1_000_000),
            targetAddress: factorySC,
            targetFunction: "getLBPairInformation",
            parameter: new Args()
                .addString(token0)
                .addString(token1)
                .addU32(binStep)
                .serialize(),
            maxGas: BigInt(100_000_000),
        })
        .then((res) => {
            const returnValue = new Args(res.returnValue);
            const _ = returnValue.nextU32();
            const lpAddress = returnValue.nextString();
            return lpAddress;
        })
        .catch((err) => {
            console.log(err);
            return undefined;
        });

export const getTokenValue = async (
    tokenAddress: string
): Promise<number | undefined> => {
    if (tokenAddress === usdcSC) return 1;

    const binSteps = await fetchPairBinSteps(tokenAddress, usdcSC);
    const pairAddress = await fetchPairAddress(
        tokenAddress,
        usdcSC,
        binSteps[0]
    );
    if (!pairAddress) return;

    const price = await getActivePrice(pairAddress, binSteps[0]);
    return tokenAddress < usdcSC ? price : 1 / price;
};
