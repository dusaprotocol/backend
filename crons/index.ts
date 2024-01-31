import { prisma } from "../common/db";
import logger from "../common/logger";
import { fillAnalytics } from "./cron";

(async () => {
  await fillAnalytics();
  await prisma.$disconnect().then(() => logger.silly("Disconnected from DB"));
})();
