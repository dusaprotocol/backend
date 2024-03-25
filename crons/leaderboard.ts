import { Maker, Prisma, Swap } from "@prisma/client";
import { prisma } from "../common/db";
import logger from "../common/logger";
import { ONE_DAY, getDailyTick } from "../common/utils";
import { dcaSC } from "../common/contracts";

const zealySprintId = 1;

const getSwaps = async (from: Date, to: Date = new Date()) => {
  return prisma.user.findMany({
    include: {
      swapTxs: {
        where: {
          timestamp: {
            gte: from,
          },
        },
      },
    },
    where: {
      swapTxs: {
        some: {
          timestamp: {
            gte: from,
          },
        },
      },
      address: {
        notIn: [dcaSC],
      },
    },
  });
};
const processSwaps = async (
  users: Prisma.UserGetPayload<{ include: { swapTxs: true } }>[]
) => {
  users.forEach(async (user) => {
    const score = user.swapTxs.reduce((acc, swap) => {
      return acc + getSwapValue(swap);
    }, 0);
    await prisma.leaderboard.upsert({
      where: {
        userAddress: user.address,
      },
      update: {
        score: {
          increment: score,
        },
      },
      create: {
        userAddress: user.address,
        score,
        zealySprintId,
      },
    });
  });
};

const getMakers = async (from: Date, to: Date = new Date()) => {
  return prisma.maker.findMany({
    where: {
      date: {
        gte: from,
        lt: to,
      },
    },
  });
  // return prisma.$queryRaw`
  //   SELECT address, SUM(accruedFeesUsd) as accruedFeesUsd, SUM(volume) as volume
  //   FROM Maker
  //   WHERE date BETWEEN ${from} AND ${to}
  //   GROUP BY address
  // `;
};
const processMakers = async (makers: Maker[]) => {
  makers.forEach(async (maker) => {
    const score = getMakerValue(maker);
    await prisma.leaderboard.upsert({
      where: {
        userAddress: maker.address,
      },
      update: {
        score: { increment: score },
      },
      create: {
        userAddress: maker.address,
        score,
        zealySprintId,
      },
    });
  });
};

const getSwapValue = (swap: Swap) => {
  return swap.usdValue ** 0.7;
};

const getMakerValue = (maker: Maker) => {
  return maker.accruedFeesUsd ** 0.7;
};

(async () => {
  //   logger.info("Starting leaderboard cron");
  //   processSwaps(new Date(Date.now() - ONE_DAY));

  //   await prisma.$disconnect().then(() => logger.silly("Disconnected from DB"));

  const from = new Date(Date.now() - ONE_DAY * 1);
  getSwaps(from).then((res) => processSwaps(res));
  getMakers(from).then((res) => processMakers(res));
})();
