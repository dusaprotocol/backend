import cron from "node-cron";
import { prisma } from "../common/db";
import logger from "../common/logger";
import { fetchNewAnalytics } from "../common/methods";
import { Pool, Prisma } from "@prisma/client";
import { EVERY_TICK, getClosestTick } from "../common/utils";

const fillAnalytics = async () => {
  logger.silly(`running the analytics task at ${new Date().toString()}`);

  const pools = await prisma.pool.findMany();
  pools.forEach(async (pool) => {
    await fetchNewAnalytics(pool.address, pool.binStep)
      .then(() => logger.silly(`fetched new analytics for ${pool.address}`))
      .catch((e) => logger.warn(e));
  });
};

if (!cron.validate(EVERY_TICK)) throw new Error("Invalid cron expression");
export const analyticsCron = cron.schedule(EVERY_TICK, fillAnalytics, {
  scheduled: false,
});
