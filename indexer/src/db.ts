import { DCA, Prisma, Status } from "@prisma/client";
import { handlePrismaError, prisma } from "../../common/db";
import logger from "../../common/logger";
import {
  getClosestTick,
  getDailyTick,
  getHourlyTick,
} from "../../common/utils";

const coc = (address: string) => ({
  connectOrCreate: {
    where: { address },
    create: { address },
  },
});

const co = (address: string) => ({
  connect: { address },
});

export const createSwap = async (
  payload: Prisma.SwapUncheckedCreateInput
): Promise<boolean> => {
  // prettier-ignore
  const { poolAddress, userAddress, amountIn, amountOut, feesIn, swapForY, binId, timestamp, txHash, usdValue, feesUsdValue, indexInSlot } = payload;
  return prisma.swap
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
    .then(() => true)
    .catch((err) => {
      return false;
    });
};

export const createLiquidity = async (
  payload: Prisma.LiquidityUncheckedCreateInput
): Promise<boolean> => {
  // prettier-ignore
  const { poolAddress, userAddress, amount0, amount1, lowerBound, upperBound, timestamp, txHash, usdValue, indexInSlot } = payload;
  return prisma.liquidity
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
    .then(() => true)
    .catch((err) => {
      handlePrismaError(err);
      return false;
    });
};

export const updateBinVolume = async (
  params: Omit<Prisma.BinUpsertArgs["create"], "date">
) => {
  // prettier-ignore
  const { binId, feesUsd, volumeUsd, poolAddress } = params;

  const date = getHourlyTick();
  await prisma.bin
    .upsert({
      create: {
        date,
        binId,
        feesUsd,
        volumeUsd,
        poolAddress,
      },
      update: {
        feesUsd: {
          increment: feesUsd,
        },
        volumeUsd: {
          increment: volumeUsd,
        },
      },
      where: {
        poolAddress_binId_date: {
          binId,
          date,
          poolAddress,
        },
      },
    })
    .catch(() =>
      logger.warn("bin upsert failed", { binId, poolAddress, date })
    );
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
        user: coc(dca.userAddress),
      },
    })
    .catch(handlePrismaError);

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

  return prisma.analytics
    .create({
      data: {
        ...args,
        date,
      },
    })
    .catch(() => logger.warn("createAnalytic failed", args));
};

export const updateMakerFees = async (
  params: Omit<Prisma.MakerUncheckedCreateInput, "date">
) => {
  const date = getDailyTick();
  const { address, poolAddress, accruedFeesX, accruedFeesY, accruedFeesL } =
    params;

  const where = {
    address_poolAddress_date: {
      address,
      poolAddress,
      date,
    },
  };
  const prev = await prisma.maker
    .findUnique({
      where,
      select: {
        accruedFeesUsd: true,
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
          accruedFeesUsd: 0,
        }
    );
  await prisma.maker.upsert({
    where,
    update: {
      accruedFeesUsd: { increment: params.accruedFeesUsd },
      accruedFeesX: updateFees(prev.accruedFeesX, accruedFeesX),
      accruedFeesY: updateFees(prev.accruedFeesY, accruedFeesY),
      accruedFeesL: updateFees(prev.accruedFeesL, accruedFeesL),
      volume: { increment: params.volume },
    },
    create: {
      ...params,
      date,
    },
  });
};

const updateFees = (current: string, increment: string) =>
  (BigInt(current) + BigInt(increment)).toString();
