import { DCA, Prisma, Status } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { getClosestTick } from "../../common/utils";
import { fetchNewAnalytics } from "../../common/methods";

export const createSwap = async (payload: Prisma.SwapUncheckedCreateInput) => {
  // prettier-ignore
  const { poolAddress, userAddress, amountIn, amountOut, feesIn, swapForY, binId, timestamp, txHash, usdValue, feesUsdValue, indexInSlot } = payload;
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
      feesIn,
      binId,
      timestamp,
      txHash,
      usdValue,
      feesUsdValue,
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
  await prisma.liquidity.create({
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

export const findDCA = async (id: number) =>
  await prisma.dCA.findUniqueOrThrow({
    where: {
      id,
    },
  });

export const createDCA = async (dca: DCA) =>
  await prisma.dCA.create({
    data: {
      ...dca,
    },
  });

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
  args: Omit<Prisma.AnalyticsUncheckedCreateInput, "date">
) => {
  const date = getClosestTick();

  return await prisma.analytics.create({
    data: {
      ...args,
      date,
    },
  });
};
