import { Prisma, Status } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { getClosestTick } from "../../common/utils";
import { fetchNewAnalytics } from "../../common/methods";

export const createSwap = async (payload: Prisma.SwapUncheckedCreateInput) => {
  // prettier-ignore
  const { poolAddress, userAddress, amountIn, amountOut, swapForY, binId, timestamp, txHash, usdValue, indexInSlot } = payload;
  await prisma.swap.create({
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

const findAnalytic = async (poolAddress: string, date: Date) =>
  await prisma.analytics.findUniqueOrThrow({
    where: {
      poolAddress_date: {
        poolAddress,
        date,
      },
    },
  });

export const updateVolumeAndPrice = async (
  poolAddress: string,
  binStep: number,
  volume: number,
  fees: number,
  price: number
) => {
  const date = getClosestTick();
  const curr = await findAnalytic(poolAddress, date).catch(async () => {
    logger.warn(
      `No analytics entry found for ${poolAddress} at ${date.toString()}`
    );
    await fetchNewAnalytics(poolAddress, binStep);
    return findAnalytic(poolAddress, date);
  });

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

export const updateDCAStatus = async (id: number, status: Status) => {
  await prisma.dCA.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });
};

export const createAnalytic = async (
  args: Omit<Prisma.AnalyticsUncheckedCreateInput, "date" | "volume" | "fees">
) => {
  const date = getClosestTick();

  await prisma.analytics.create({
    data: {
      ...args,
      date,
      volume: 0,
      fees: 0,
    },
  });
};
