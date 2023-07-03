import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { Prisma } from "@prisma/client";
import { prisma } from "./../common/db";
import {
  getBinStep,
  getCallee,
  getPriceFromId,
  getTokenValue,
} from "./../common/methods";
import { getGenesisTimestamp, parseSlot } from "./../common/utils";
import logger from "../common/logger";

export const indexedMethods = [
  "swapExactTokensForTokens",
  "addLiquidity",
  "removeLiquidity",
];

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
    amountIn += totalFees;

    getTokenValue(tokenIn).then((valueIn) => {
      if (!valueIn) return;

      const volume = Math.round((amountIn / 10 ** 9) * valueIn);
      const fees = Math.round((totalFees / 10 ** 9) * valueIn * 100); // fees are stored in cents
      updateVolumeAndPrice(poolAddress, volume, fees, price);

      prisma.swap
        .create({
          data: {
            poolAddress,
            swapForY,
            binId,
            amountIn,
            amountOut,
            usdValue: volume,
            timestamp,
            txHash,
          },
        })
        .then((e) => logger.info(e))
        .catch((e) => logger.warn(e));
    });
  });
};

export const processLiquidity = (
  txHash: string,
  timestamp: string | Date,
  poolAddress: string,
  token0: string,
  token1: string,
  events: string[],
  isAddLiquidity: boolean
) => {
  getBinStep(poolAddress).then(async (binStep) => {
    if (!binStep) return;

    let amountX = 0;
    let amountY = 0;

    events.forEach((event) => {
      const [to, _binId, _amountX, _amountY] = event.split(",");

      amountX += Number(_amountX);
      amountY += Number(_amountY);
    });

    const amount0 = isAddLiquidity ? amountX : -amountX;
    const amount1 = isAddLiquidity ? amountY : -amountY;
    const lowerBound = Number(events[0].split(",")[1]);
    const upperBound = Number(events[events.length - 1].split(",")[1]);

    const token0Value = await getTokenValue(token0);
    const token1Value = await getTokenValue(token1);
    const usdValue =
      (token0Value ?? 0) * (amount0 / 10 ** 9) +
      (token1Value ?? 0) * (amount1 / 10 ** 9);

    prisma.liquidity
      .create({
        data: {
          poolAddress,
          amount0,
          amount1,
          usdValue,
          lowerBound,
          upperBound,
          timestamp,
          txHash,
        },
      })
      .then((e) => logger.info(e))
      .catch((e) => logger.warn(e));
  });
};

export const processEvents = (
  txId: string,
  method: string,
  events: IEvent[]
) => {
  logger.info({ txId, method });
  if (
    !events.length ||
    events[events.length - 1].data.includes("massa_execution_error")
  )
    return;

  const genesisTimestamp = getGenesisTimestamp();
  const timestamp = parseSlot(events[0].context.slot, genesisTimestamp);
  switch (method) {
    case "swap":
    case "swapExactTokensForMAS":
    case "swapExactMASForTokens":
    case "swapTokensForExactTokens":
    case "swapTokensForExactMAS":
    case "swapMASForExactTokens":
    case "swapExactTokensForTokens": {
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
    case "addLiquidityMAS":
    case "removeLiquidityMAS":
    case "removeLiquidity": {
      const isAdd = method === "addLiquidity";
      const pairAddress = events[0].data.split(",")[isAdd ? 1 : 2];

      processLiquidity(
        txId,
        new Date(timestamp),
        pairAddress,
        getCallee(events[events.length - 2]),
        getCallee(events[events.length - 1]),
        events
          .map((e) => e.data)
          .filter(
            (e) =>
              e.startsWith("DEPOSITED_TO_BIN:") ||
              e.startsWith("WITHDRAWN_FROM_BIN:")
          ),
        isAdd
      );
    }
  }
};

// COMMON PRISMA ACTIONS

export const updateVolumeAndPrice = (
  poolAddress: string,
  volume: number,
  fees: number,
  price: number
) => {
  const date = new Date();
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.analytics
    .upsert({
      where: {
        poolAddress_date: {
          poolAddress,
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
        poolAddress,
        date,
        volume,
        fees,
        token0Locked: 0,
        token1Locked: 0,
        usdLocked: 0,
        close: 0,
        high: 0,
        low: 0,
        open: 0,
      },
    })
    .then((e) => logger.info(e))
    .catch((err) => logger.warn(err));
};

export const addPrice = (
  poolAddress: string,
  price: number,
  date: Date = new Date()
) => {
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.analytics
    .findUnique({
      where: {
        poolAddress_date: {
          poolAddress,
          date,
        },
      },
    })
    .then((curr) => {
      if (!curr) {
        prisma.analytics
          .create({
            data: {
              poolAddress,
              date,
              open: price,
              high: price,
              low: price,
              close: price,
              fees: 0,
              volume: 0,
              token0Locked: 0,
              token1Locked: 0,
              usdLocked: 0,
            },
          })
          .then((e) => logger.info(e))
          .catch((err) => logger.warn(err));
        return;
      }

      const data: Prisma.AnalyticsUpdateInput = {
        close: price,
      };
      if (price > curr.high) data.high = price;
      if (price < curr.low) data.low = price;

      prisma.analytics
        .update({
          where: {
            poolAddress_date: {
              poolAddress,
              date,
            },
          },
          data,
        })
        .then((e) => logger.info(e))
        .catch((err) => logger.warn(err));
    })
    .catch((err) => logger.warn(err));
};
