import { Prisma, Swap } from "@prisma/client";
import { prisma } from "../common/db";
import logger from "../common/logger";
import { ONE_DAY, getDailyTick } from "../common/utils";

const processSwaps = async (from: Date, to: Date = new Date()) => {
  const swaps = await prisma.swap.findMany({
    where: {
      timestamp: {
        gte: from,
        lt: to,
      },
    },
  });
  swaps.forEach(async (swap) => {
    prisma.leaderboard.update({
      where: {
        userAddress: swap.userAddress,
      },
      data: {
        score: {
          increment: getSwapValue(swap),
        },
      },
    });
  });
};

const getSwapValue = (swap: Swap) => {
  return swap.usdValue ** 0.7;
};

(async () => {
  //   logger.info("Starting leaderboard cron");
  //   processSwaps(new Date(Date.now() - ONE_DAY));

  //   await prisma.$disconnect().then(() => logger.silly("Disconnected from DB"));

  processSwaps(new Date(Date.now() - ONE_DAY * 30));
})();
