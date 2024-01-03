import cron from "node-cron";
import { prisma } from "../common/db";
import logger from "../common/logger";
import { fetchNewAnalytics } from "../common/methods";
import { Pool, Prisma } from "@prisma/client";
import { EVERY_TICK, getClosestTick } from "../common/utils";

const fillAnalytics = async () => {
  logger.silly(`[${new Date().toISOString()}]: running the analytics task`);

  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  pools.forEach(async (pool) => {
    await fetchNewAnalytics(pool).catch((e) => {
      logger.warn(e.message);
    });
  });
};

if (!cron.validate(EVERY_TICK)) throw new Error("Invalid cron expression");
export const analyticsCron = cron.schedule(EVERY_TICK, fillAnalytics, {
  scheduled: false,
});
