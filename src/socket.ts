import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { web3Client } from "./client";
import { prisma } from "./db";
import { getBinStep, getCallee, getPriceFromId } from "./methods";
import { Prisma } from "@prisma/client";
import { factorySC, usdcSC } from "./contracts";
import { getGenesisTimestamp, parseSlot } from "./utils";

type TxType = "addLiquidity" | "removeLiquidity" | "swap";

// EVENT PROCESSING

export const processSwap = (
    txHash: string,
    timestamp: string | Date,
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    swapEvents: string[]
) => {
    getBinStep(poolAddress).then((binStep) => {
        console.log({ binStep });
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
            console.log({ valueIn });
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
};

export const processLiquidity = (
    poolAddress: string,
    tokenX: string,
    tokenY: string,
    events: string[],
    isAddLiquidity: boolean
) => {
    getBinStep(poolAddress).then((binStep) => {
        console.log({ binStep });
        if (!binStep) return;

        let amountX = 0;
        let amountY = 0;

        events.forEach((event) => {
            const [to, _binId, _amountX, _amountY] = event.split(",");

            amountX += Number(_amountX);
            amountY += Number(_amountY);
        });

        addTvl(
            poolAddress,
            isAddLiquidity ? amountX : -amountX,
            isAddLiquidity ? amountY : -amountY,
            new Date()
        );
    });
};

export const processEvents = (
    txId: string,
    method: string,
    events: IEvent[]
) => {
    if (
        !events.length ||
        events[events.length - 1].data.includes("massa_execution_error")
    )
        return;

    const genesisTimestamp = getGenesisTimestamp();
    const timestamp = parseSlot(events[0].context.slot, genesisTimestamp);
    switch (method as TxType) {
        case "swap": {
            const pairAddress = events[0].data.split(",")[1];
            const tokenIn = getCallee(events[0]);
            const tokenOut = getCallee(events[events.length - 1]);
            processSwap(
                txId,
                new Date(timestamp),
                pairAddress,
                tokenIn,
                tokenOut,
                events.map((e) => e.data).filter((e) => e.startsWith("SWAP:"))
            );
            break;
        }
        case "addLiquidity":
        case "removeLiquidity":
            const isAdd = method === "addLiquidity";

            const tokenX = ""; //getCallee(events[0]);
            const tokenY = ""; // getCallee(events[1]);
            const pairAddress = events[0].data.split(",")[isAdd ? 1 : 2];

            processLiquidity(
                pairAddress,
                tokenX,
                tokenY,
                events
                    .map((e) => e.data)
                    .filter(
                        (e) =>
                            e.startsWith("DEPOSITED_TO_BIN:") ||
                            e.startsWith("WITHDRAWN_FROM_BIN:")
                    ),
                isAdd
            );
            break;
        default:
            console.log(method);
            break;
    }
};

// COMMON PRISMA ACTIONS

export const addVolume = (
    address: string,
    volume: number,
    fees: number,
    date: Date = new Date()
) => {
    date.setHours(date.getHours(), 0, 0, 0);

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
                token0Locked: 0,
                token1Locked: 0,
            },
        })
        // .then((e) => console.log(e))
        .catch((e) => console.log(e));
};

export const addTvl = (
    address: string,
    token0Locked: number,
    token1Locked: number,
    date: Date = new Date()
) => {
    date.setHours(date.getHours(), 0, 0, 0);

    prisma.analytics
        .upsert({
            where: {
                date_address: {
                    address,
                    date,
                },
            },
            update: {
                token0Locked: {
                    increment: token0Locked,
                },
                token1Locked: {
                    increment: token1Locked,
                },
            },
            create: {
                address,
                date,
                volume: 0,
                fees: 0,
                token0Locked,
                token1Locked,
            },
        })
        .then((e) => console.log(e))
        .catch((e) => console.log(e));
};

export const addPrice = (
    address: string,
    price: number,
    date: Date = new Date()
) => {
    date.setHours(date.getHours(), 0, 0, 0);

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
        })
        .catch((e) => console.log(e));
};

// MISC

export const getActivePrice = (
    poolAddress: string,
    binStep?: number
): Promise<number> =>
    web3Client
        .publicApi()
        .getDatastoreEntries([
            {
                address: poolAddress,
                key: strToBytes("PAIR_INFORMATION"),
            },
            {
                address: poolAddress,
                key: strToBytes("FEES_PARAMETERS"),
            },
        ])
        .then((r) => {
            const pairInfoData = r[0].final_value;
            const feesData = r[1].final_value;
            if (!pairInfoData || !feesData) return 0;

            const activeId = new Args(pairInfoData).nextU32();
            const binStep = new Args(feesData).nextU32();
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
