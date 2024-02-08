import { DCA, Prisma, Status } from "@prisma/client";
import { prisma } from "../../common/db";
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
  params: Omit<Prisma.MakerUncheckedCreateInput, "date">
) => {
  const date = getDailyTick();

  const {
    address,
    poolAddress,
    accruedFeesUsd,
    accruedFeesX,
    accruedFeesY,
    accruedFeesL,
  } = params;
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
      accruedFeesUsd: { increment: accruedFeesUsd },
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
      date,
      accruedFeesUsd,
      accruedFeesX,
      accruedFeesY,
      accruedFeesL,
    },
  });
};

// export const updateStreak = async (address: string, poolAddress: string) => {
//   const lastDate = new Date();
//   const prev = await prisma.streak.findUnique({
//     where: {
//       address_poolAddress: {
//         address,
//         poolAddress,
//       },
//     },
//     select: {
//       lastDate: true,
//     },
//   });

//   // if the last streak was today, return
//   if (prev?.lastDate && prev.lastDate.getDay() === lastDate.getDay()) return;

//   // if the last streak was before yesterday, reset the streak
//   if (prev?.lastDate && prev.lastDate.getDay() !== lastDate.getDay() - 1) {
//     await prisma.streak.update({
//       where: {
//         address_poolAddress: {
//           address,
//           poolAddress,
//         },
//       },
//       data: {
//         streak: 1,
//         lastDate,
//       },
//     });
//     return;
//   }

//   await prisma.streak.upsert({
//     where: {
//       address_poolAddress: {
//         address,
//         poolAddress,
//       },
//     },
//     update: {
//       streak: { increment: 1 },
//       lastDate,
//     },
//     create: {
//       address,
//       poolAddress,
//       streak: 1,
//       lastDate,
//     },
//   });
// };
