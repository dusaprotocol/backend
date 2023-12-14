import { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { getClosestTick } from "../../common/utils";
import { fetchNewAnalytics } from "../../common/methods";

export const createSwap = async (payload: Prisma.SwapUncheckedCreateInput) => {
  // prettier-ignore
  const { poolAddress, userAddress, amountIn, amountOut, swapForY, binId, timestamp, txHash, usdValue, indexInSlot } = payload;
  prisma.swap.create({
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
      amountIn,
      amountOut,
      binId,
      timestamp,
      txHash,
      usdValue,
      indexInSlot,
      swapForY,
    },
  });
};

export const createLiquidity = async (
  payload: Prisma.LiquidityUncheckedCreateInput
) => {
  // prettier-ignore
  const { poolAddress, userAddress, amount0, amount1, lowerBound, upperBound, timestamp, txHash, usdValue, indexInSlot } = payload;
  prisma.liquidity.create({
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
      lowerBound,
      upperBound,
      timestamp,
      txHash,
      usdValue,
      indexInSlot,
    },
  });
};

export const updateVolumeAndPrice = async (
  poolAddress: string,
  binStep: number,
  volume: number,
  fees: number,
  price: number
) => {
  const date = getClosestTick();
  const curr = await prisma.analytics.findUnique({
    where: {
      poolAddress_date: {
        poolAddress,
        date,
      },
    },
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

  prisma.analytics.update({
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
  });
};

export const createAnalytic = async (
  args: Omit<Prisma.AnalyticsUncheckedCreateInput, "date" | "volume" | "fees">
) => {
  const date = getClosestTick();

  prisma.analytics.create({
    data: {
      ...args,
      date,
      volume: 0,
      fees: 0,
    },
  });
};
