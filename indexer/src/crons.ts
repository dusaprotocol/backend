import cron from "node-cron";
import { ISlot } from "@massalabs/massa-web3";
import { prisma } from "./../common/db";
import { dcaSC } from "./../common/contracts";
import { web3Client } from "./../common/client";
import { processEvents } from "./socket";
import logger from "../common/logger";

const getPairAddresses = () =>
  prisma.price
    .findMany({
      select: {
        address: true,
      },
      distinct: ["address"],
    })
    .then((res) => res.map((r) => r.address))
    .catch((e) => {
      logger.warn(e);
      return [];
    });

const fillPrice = () => {
  logger.info(`running the price task at ${Date.now()}`);

  getPairAddresses().then((addresses) => {
    addresses.forEach((address) => {
      prisma.price
        .findFirst({
          where: {
            address,
          },
          orderBy: {
            date: "desc",
          },
        })
        .then((price) => {
          if (!price) {
            return;
          }

          const date = new Date();
          date.setHours(date.getHours(), 0, 0, 0);

          prisma.price
            .create({
              data: {
                address,
                date,
                close: price.close,
                high: price.close,
                low: price.close,
                open: price.close,
              },
            })
            .then((p) => logger.info(p))
            .catch((e) => logger.warn(e));
        })
        .catch((e) => logger.warn(e));
    });
  });
};

const fillAnalytics = () => {
  logger.info(`running the analytics task at ${Date.now()}`);

  getPairAddresses().then((addresses) => {
    const date = new Date();
    date.setHours(date.getHours(), 0, 0, 0);

    addresses.forEach((address) => {
      prisma.analytics
        .findFirst({
          where: {
            address,
          },
          orderBy: {
            date: "desc",
          },
        })
        .then((analytic) => {
          if (!analytic) return;

          prisma.analytics
            .create({
              data: {
                address,
                date,
                token0Locked: analytic.token0Locked,
                token1Locked: analytic.token1Locked,
                volume: 0,
                fees: 0,
              },
            })
            .then((t) => logger.info(t))
            .catch((e) => logger.warn(e));
        })
        .catch((e) => logger.warn(e));
    });
  });
};

const everyHour = "0 0 */1 * * *" as const;
const everyPeriod = "*/16 * * * * *" as const;

export const priceTask = cron.schedule(everyHour, fillPrice, {
  scheduled: false,
});
export const analyticsTask = cron.schedule(everyHour, fillAnalytics, {
  scheduled: false,
});

let slot: ISlot;

const processAutonomousEvents = async () => {
  logger.silly(`running the autonomous events task for period ${slot.period}`);

  if (!slot)
    slot = await web3Client
      .publicApi()
      .getNodeStatus()
      .then((r) => ({
        period: r.last_slot.period - 5,
        thread: 0,
      }));

  const start = slot;
  const end = { ...slot, thread: 31 };
  web3Client
    .smartContracts()
    .getFilteredScOutputEvents({
      emitter_address: dcaSC,
      is_final: null,
      original_caller_address: null,
      original_operation_id: null,
      start,
      end,
    })
    .then((events) => {
      logger.silly(events.map((e) => e.data));
      processEvents("", "swap", events.slice(1));
      slot.period += 1;
    });
};

export const autonomousEvents = cron.schedule(
  everyPeriod,
  processAutonomousEvents,
  {
    scheduled: false,
  }
);
