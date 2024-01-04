import { prisma } from "../common/db";
import { fillAnalytics } from "./cron";

(async () => {
  await fillAnalytics();
  prisma.$disconnect();
})();
