import { Prisma, PrismaClient } from "@prisma/client";
import logger from "./logger";

export const prisma = new PrismaClient({
  log: [],
});

export const handlePrismaError = (err: Error) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code !== "P2002") {
      // unique constraint failed
      logger.warn(err.message);
    }
  }
};
