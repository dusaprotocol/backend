import { prisma } from "../common/db";
import logger from "../common/logger";
import { fetchNewAnalytics } from "../common/methods";

(async () => {
  logger.silly(`[${new Date().toISOString()}]: running the analytics task`);

  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  pools.forEach(async (pool) => {
    await fetchNewAnalytics(pool).catch((e) => {
      logger.warn(e.message);
    });
  });
})();
