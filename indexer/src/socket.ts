import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import {
  getTokenFromAddress,
  getTokenValue,
  toFraction,
} from "../../common/methods";
import { getClosestTick } from "../../common/utils";
import logger from "../../common/logger";
import { SwapParams, decodeLiquidityEvents, decodeSwapEvents } from "./decoder";
import { fetchNewAnalytics } from "./crons";
import { EventDecoder, TokenAmount } from "@dusalabs/sdk";

// EVENT PROCESSING

export const processSwap = async (
  txHash: string,
  indexInSlot: number,
  userAddress: string,
  timestamp: string | Date,
  poolAddress: string,
  tokenInAddress: string,
  tokenOutAddress: string,
  binStep: number,
  swapEvents: string[],
  swapParams?: SwapParams
) => {
  const swapPayload = decodeSwapEvents(swapEvents, binStep);
  const { amountIn, totalFees, price } = swapPayload;

  const valueIn = await getTokenValue(tokenInAddress, false);
  if (!valueIn) return;

  const tokenIn = await getTokenFromAddress(tokenInAddress);
  const tokenOut = await getTokenFromAddress(tokenOutAddress);
  if (!tokenIn || !tokenOut) return;

  const token0 = tokenIn.address < tokenOut.address ? tokenIn : tokenOut;
  const token1 = tokenIn.address < tokenOut.address ? tokenOut : tokenIn;
  const priceAdjusted = price * 10 ** (token1.decimals - token0.decimals);

  const volume = Number(
    new TokenAmount(tokenIn, amountIn)
      .multiply(toFraction(valueIn))
      .toSignificant(6)
  );
  // fees are stored in cents
  const fees = Number(
    new TokenAmount(tokenIn, totalFees)
      .multiply(toFraction(valueIn))
      .toSignificant(6)
  );
  updateVolumeAndPrice(poolAddress, binStep, volume, fees, priceAdjusted);
  createSwap({
    ...swapPayload,
    timestamp,
    userAddress,
    poolAddress,
    txHash,
    usdValue: volume,
  });
};

export const processLiquidity = async (
  txHash: string,
  userAddress: string,
  timestamp: string | Date,
  poolAddress: string,
  token0Address: string,
  token1Address: string,
  liqEvents: string[],
  isAddLiquidity: boolean
) => {
  const { amountX, amountY } = decodeLiquidityEvents(liqEvents);

  const amount0 = isAddLiquidity ? amountX : -amountX;
  const amount1 = isAddLiquidity ? amountY : -amountY;

  const lowerBound = EventDecoder.decodeLiquidity(liqEvents[0]).id;
  const upperBound = EventDecoder.decodeLiquidity(
    liqEvents[liqEvents.length - 1]
  ).id;

  const token0 = await getTokenFromAddress(token0Address);
  const token1 = await getTokenFromAddress(token1Address);
  if (!token0 || !token1) return;

  const token0Value = (await getTokenValue(token0Address), false) || 0;
  const token1Value = (await getTokenValue(token1Address), false) || 0;

  const usdValue = Number(
    new TokenAmount(token0, amount0)
      .multiply(toFraction(token0Value))
      .add(new TokenAmount(token1, amount1).multiply(toFraction(token1Value)))
      .toSignificant(6)
  );

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
    .catch((e) => logger.warn(e));
};

// COMMON PRISMA ACTIONS

export const createSwap = async (payload: Prisma.SwapUncheckedCreateInput) => {
  const { amountIn, amountOut, binId, swapForY, timestamp, txHash, usdValue } =
    payload;

  prisma.swap
    .create({
      data: {
        pool: {
          connect: {
            address: payload.poolAddress,
          },
        },
        user: {
          connectOrCreate: {
            where: {
              address: payload.userAddress,
            },
            create: {
              address: payload.userAddress,
            },
          },
        },
        amountIn,
        amountOut,
        binId,
        swapForY,
        timestamp,
        txHash,
        usdValue,
      },
    })
    .catch((e) => logger.warn(e));
};

export const updateVolumeAndPrice = async (
  poolAddress: string,
  binStep: number,
  volume: number,
  fees: number,
  price: number
) => {
  const date = getClosestTick(Date.now());
  const curr = await prisma.analytics
    .findMany({
      where: {
        poolAddress,
        date,
      },
    })
    .then((e) => {
      const res = e.length ? e[0] : undefined;
      return res;
    })
    .catch((err) => {
      logger.warn(err);
      return;
    });
  if (!curr) {
    logger.warn(
      `No analytics entry found for pool ${poolAddress} at date ${date.toString()}`
    );
    fetchNewAnalytics(poolAddress, binStep);
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
    .catch((err) => logger.warn(err));
};
