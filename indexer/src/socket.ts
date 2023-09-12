import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import {
  getBinStep,
  getCallee,
  getPriceFromId,
  getTokenValue,
} from "../../common/methods";
import { getClosestTick } from "../../common/utils";
import logger from "../../common/logger";
import { SwapParams } from "./decoder";

// EVENT PROCESSING

export const processSwap = (
  txHash: string,
  indexInSlot: number,
  userAddress: string,
  timestamp: string | Date,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  binStep: number,
  swapEvents: IEvent[],
  swapParams: SwapParams
) => {
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
    ] = event.data.split(",");

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
          pool: {
            connect: {
              address: poolAddress,
            },
          },
          user: {
            connectOrCreate: {
              where: {
                address: userAddress,
              },
              create: {
                address: userAddress,
              },
            },
          },
          swapForY,
          binId,
          amountIn,
          amountOut,
          usdValue: volume,
          timestamp,
          txHash,
          indexInSlot,
        },
      })
      .then((e) => logger.info(e))
      .catch((e) => logger.warn(e));
  });
};

export const processLiquidity = async (
  txHash: string,
  userAddress: string,
  timestamp: string | Date,
  poolAddress: string,
  token0: string,
  token1: string,
  liqEvents: IEvent[],
  isAddLiquidity: boolean
) => {
  let amountX = 0;
  let amountY = 0;

  liqEvents.forEach((event) => {
    const [to, _binId, _amountX, _amountY] = event.data.split(",");

    amountX += Number(_amountX);
    amountY += Number(_amountY);
  });

  const amount0 = isAddLiquidity ? amountX : -amountX;
  const amount1 = isAddLiquidity ? amountY : -amountY;
  const lowerBound = Number(liqEvents[0].data.split(",")[1]);
  const upperBound = Number(liqEvents[liqEvents.length - 1].data.split(",")[1]);

  const token0Value = await getTokenValue(token0);
  const token1Value = await getTokenValue(token1);
  const usdValue =
    (token0Value ?? 0) * (amount0 / 10 ** 9) +
    (token1Value ?? 0) * (amount1 / 10 ** 9);

  prisma.liquidity
    .create({
      data: {
        pool: {
          connect: {
            address: poolAddress,
          },
        },
        user: {
          connectOrCreate: {
            where: {
              address: userAddress,
            },
            create: {
              address: userAddress,
            },
          },
        },
        amount0,
        amount1,
        usdValue,
        lowerBound,
        upperBound,
        timestamp,
        txHash,
        indexInSlot: 0,
      },
    })
    .then((e) => logger.info(e))
    .catch((e) => logger.warn(e));
};

// COMMON PRISMA ACTIONS

export const updateVolumeAndPrice = async (
  poolAddress: string,
  volume: number,
  fees: number,
  price: number
) => {
  const date = getClosestTick(Date.now());

  // update price
  const curr = await prisma.analytics
    .findUnique({
      where: {
        poolAddress_date: {
          poolAddress,
          date,
        },
      },
    })
    .catch((err) => {
      logger.warn(err);
      return;
    });
  if (!curr) {
    logger.warn(
      "No analytics entry found for pool " + poolAddress + " at date " + date
    );
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
      data: {
        volume: {
          increment: volume,
        },
        fees: {
          increment: fees,
        },
        ...data,
      },
    })
    .then((e) => logger.info(e))
    .catch((err) => logger.warn(err));
};
