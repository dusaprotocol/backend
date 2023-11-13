import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import {
  fetchTokenInfo,
  getPriceFromId,
  getTokenValue,
  toFraction,
} from "../../common/methods";
import { getClosestTick, multiplyWithFloat } from "../../common/utils";
import logger from "../../common/logger";
import { SwapParams, decodeSwapEvents } from "./decoder";
import { fetchNewAnalytics } from "./crons";
import { Token, TokenAmount } from "@dusalabs/sdk";
import { CHAIN_ID } from "../../common/client";

// EVENT PROCESSING

export const processSwap = async (
  txHash: string,
  indexInSlot: number,
  userAddress: string,
  timestamp: string | Date,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  binStep: number,
  swapEvents: string[],
  swapParams?: SwapParams
) => {
  const swapPayload = decodeSwapEvents(swapEvents, binStep);
  const { amountIn, amountOut, totalFees, swapForY, binId, price } =
    swapPayload;

  const valueIn = await getTokenValue(tokenIn);
  if (!valueIn) return;

  const tokenInDecimals = await fetchTokenInfo(tokenIn).then(
    (e) => e && e.decimals
  );
  if (!tokenInDecimals) return;

  const token = new Token(CHAIN_ID, tokenIn, tokenInDecimals);
  const volume = multiplyWithFloat(new TokenAmount(token, amountIn), valueIn);
  const fees = multiplyWithFloat(new TokenAmount(token, totalFees), valueIn);
  // fees are stored in cents
  updateVolumeAndPrice(poolAddress, binStep, volume, fees, price);
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
  liqEvents: IEvent[],
  isAddLiquidity: boolean
) => {
  let amountX = 0n;
  let amountY = 0n;

  liqEvents.forEach((event) => {
    const [to, _binId, _amountX, _amountY] = event.data.split(",");

    amountX += BigInt(_amountX);
    amountY += BigInt(_amountY);
  });

  const amount0 = isAddLiquidity ? amountX : -amountX;
  const amount1 = isAddLiquidity ? amountY : -amountY;
  const lowerBound = Number(liqEvents[0].data.split(",")[1]);
  const upperBound = Number(liqEvents[liqEvents.length - 1].data.split(",")[1]);

  const token0Decimals = await fetchTokenInfo(token0Address).then((e) =>
    e ? e.decimals : 0
  );
  const token1Decimals = await fetchTokenInfo(token1Address).then((e) =>
    e ? e.decimals : 0
  );

  const token0Value = (await getTokenValue(token0Address)) || 0;
  const token1Value = (await getTokenValue(token1Address)) || 0;

  const token0 = new Token(CHAIN_ID, token0Address, token0Decimals);
  const token1 = new Token(CHAIN_ID, token1Address, token1Decimals);

  const usdValue = Number(
    new TokenAmount(token0, amount0)
      .multiply(toFraction(token0Value))
      .add(new TokenAmount(token1, amount1).multiply(toFraction(token1Value)))
      .quotient
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
  const {} = payload;
  prisma.swap
    .create({
      data: {
        // pool: {
        //   connect: {
        //     address: payload.poolAddress,
        //   },
        // },
        // user: {
        //   connectOrCreate: {
        //     where: {
        //       address: payload.userAddress,
        //     },
        //     create: {
        //       address: payload.userAddress,
        //     },
        //   },
        // },
        ...payload,
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
