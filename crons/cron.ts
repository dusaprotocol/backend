import cron from "node-cron";
import { prisma } from "../common/db";
import logger from "../common/logger";
import { fetchNewAnalytics } from "../common/methods";
import { Pool, Prisma } from "@prisma/client";
import { EVERY_TICK, getClosestTick } from "../common/utils";

const getPools = (): Promise<Pool[]> =>
  prisma.pool.findMany().catch((e) => {
    logger.warn(e);
    return [];
  });

const fillAnalytics = () => {
  logger.silly(`running the analytics task at ${new Date().toString()}`);

  getPools().then((pools) => {
    pools.forEach(async (pool) => {
      fetchNewAnalytics(pool.address, pool.binStep).catch(
        (e) => logger.warn(e.message) && logger.warn(e.toString())
      );
    });
  });
};

if (!cron.validate(EVERY_TICK)) throw new Error("Invalid cron expression");
export const analyticsCron = cron.schedule(EVERY_TICK, fillAnalytics, {
  scheduled: false,
});
