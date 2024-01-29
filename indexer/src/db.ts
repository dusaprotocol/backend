import { DCA, Prisma, Status } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { getClosestTick, getCurrentEpoch } from "../../common/utils";
import { fetchNewAnalytics } from "../../common/methods";

const coc = (address: string) => ({
  connectOrCreate: {
    where: { address },
    create: { address },
  },
});

const co = (address: string) => ({
  connect: { address },
});

export const createSwap = async (payload: Prisma.SwapUncheckedCreateInput) => {
  // prettier-ignore
  const { poolAddress, userAddress, amountIn, amountOut, feesIn, swapForY, binId, timestamp, txHash, usdValue, feesUsdValue, indexInSlot } = payload;
  await prisma.swap
    .create({
      data: {
        pool: co(poolAddress),
        user: coc(userAddress),
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
    })
    .catch(() => logger.warn("createSwap failed", payload));
};

export const createLiquidity = async (
  payload: Prisma.LiquidityUncheckedCreateInput
) => {
  // prettier-ignore
  const { poolAddress, userAddress, amount0, amount1, lowerBound, upperBound, timestamp, txHash, usdValue, indexInSlot } = payload;
  await prisma.liquidity
    .create({
      data: {
        pool: co(poolAddress),
        user: coc(userAddress),
        amount0,
        amount1,
        lowerBound,
        upperBound,
        timestamp,
        txHash,
        usdValue,
        indexInSlot,
      },
    })
    .catch(() => logger.warn("createLiquidity failed", payload));
};

export const findDCA = async (id: number) =>
  await prisma.dCA.findUnique({
    where: {
      id,
    },
  });

export const createDCA = async (dca: DCA) =>
  await prisma.dCA
    .create({
      data: {
        ...dca,
        userAddress: undefined,
        User: coc(dca.userAddress),
      },
    })
    .catch(() => logger.warn("createDCA failed", dca));

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

export const updateMakerFees = async (
  params: Omit<Prisma.MakerUncheckedCreateInput, "epoch">
) => {
  const epoch = getCurrentEpoch();
  const {
    address,
    poolAddress,
    accruedFeesUSD,
    accruedFeesX,
    accruedFeesY,
    accruedFeesL,
  } = params;
  const prev = await prisma.maker
    .findUnique({
      where: {
        address_poolAddress_epoch: {
          address,
          poolAddress,
          epoch,
        },
      },
      select: {
        accruedFeesUSD: true,
        accruedFeesX: true,
        accruedFeesY: true,
        accruedFeesL: true,
      },
    })
    .then(
      (res) =>
        res || {
          accruedFeesX: "0",
          accruedFeesY: "0",
          accruedFeesL: "0",
          accruedFeesUSD: 0,
        }
    );

  await prisma.maker.upsert({
    where: {
      address_poolAddress_epoch: {
        address,
        poolAddress,
        epoch,
      },
    },
    update: {
      accruedFeesUSD: { increment: accruedFeesUSD },
      accruedFeesX: (
        BigInt(accruedFeesX) + BigInt(prev.accruedFeesX)
      ).toString(),
      accruedFeesY: (
        BigInt(accruedFeesY) + BigInt(prev.accruedFeesY)
      ).toString(),
      accruedFeesL: (
        BigInt(accruedFeesL) + BigInt(prev.accruedFeesL)
      ).toString(),
    },
    create: {
      address,
      poolAddress,
      epoch,
      accruedFeesUSD,
      accruedFeesX,
      accruedFeesY,
      accruedFeesL,
    },
  });
};
