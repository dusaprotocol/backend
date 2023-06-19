import cron from "node-cron";
import { ISlot, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "./../common/db";
import { dcaSC, factorySC } from "./../common/contracts";
import { web3Client } from "./../common/client";
import { processEvents } from "./socket";
import logger from "../common/logger";
import { getActivePrice, getLockedReserves } from "../common/methods";
import type { Price } from "@prisma/client";
import { Args } from "@massalabs/massa-web3";

const getPairAddresses = (): Promise<string[]> =>
  // prisma.price
  //   .findMany({
  //     select: {
  //       address: true,
  //     },
  //     distinct: ["address"],
  //   })
  //   .then((res) => res.map((r) => r.address))
  //   .catch((e) => {
  //     logger.warn(e);
  //     return [];
  //   });

  web3Client
    .publicApi()
    .getAddresses([factorySC])
    .then(async (res) => {
      const keys = res[0].final_datastore_keys
        .map((k) => String.fromCharCode(...k))
        .filter((k) => k.startsWith("PAIR_INFORMATION::"));
      return web3Client
        .publicApi()
        .getDatastoreEntries(
          keys.map((k) => ({ key: strToBytes(k), address: factorySC }))
        )
        .then((r) =>
          r.reduce((acc, entry) => {
            if (entry.final_value) {
              const pairInformation = new Args(entry.final_value);
              const binStep = pairInformation.nextU32();
              const pairAddress = pairInformation.nextString();
              acc.push(pairAddress);
            }
            return acc;
          }, [] as string[])
        )
        .catch((err) => {
          logger.warn(err);
          return [];
        });
    })
    .catch((err) => {
      logger.warn(err);
      return [];
    });

const fillPrice = () => {
  logger.info(`running the price task at ${new Date().toString()}`);

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
          if (!price)
            getActivePrice(address).then((p) => createPrice(address, p));
          else createPrice(address, price.close);
        })
        .catch((e) => logger.warn(e));
    });
  });
};

const fillAnalytics = () => {
  logger.info(`running the analytics task at ${new Date().toString()}`);

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
          if (!analytic)
            getLockedReserves(address).then((r) =>
              createAnalytic(address, BigInt(r[0]), BigInt(r[1]))
            );
          else
            createAnalytic(
              address,
              analytic.token0Locked,
              analytic.token1Locked
            );
        })
        .catch((e) => logger.warn(e));
    });
  });
};

const createPrice = (address: string, close: number) => {
  const date = new Date();
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.price
    .create({
      data: {
        address,
        date,
        close: close,
        high: close,
        low: close,
        open: close,
      },
    })
    .then((p) => logger.info(p))
    .catch((e) => logger.warn(e));
};

const createAnalytic = (
  address: string,
  token0Locked: bigint,
  token1Locked: bigint
) => {
  const date = new Date();
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.analytics
    .create({
      data: {
        address,
        date,
        token0Locked,
        token1Locked,
        volume: BigInt(0),
        fees: BigInt(0),
      },
    })
    .then((p) => logger.info(p))
    .catch((e) => logger.warn(e));
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
