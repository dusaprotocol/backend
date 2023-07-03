import cron from "node-cron";
import { ISlot, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "./../common/db";
import { dcaSC, factorySC } from "./../common/contracts";
import { web3Client } from "./../common/client";
import { processEvents } from "./socket";
import logger from "../common/logger";
import {
  getActivePrice,
  getLockedReserves,
  getPairAddressTokens,
  getTokenValue,
} from "../common/methods";
import { Args } from "@massalabs/massa-web3";

const getPairAddresses = (): Promise<string[]> =>
  prisma.pool
    .findMany({
      select: {
        address: true,
      },
    })
    .then((res) => res.map((r) => r.address))
    .catch((e) => {
      logger.warn(e);
      return [];
    });

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

export const fillAnalytics = () => {
  logger.info(`running the TVL task at ${new Date().toString()}`);

  getPairAddresses().then((addresses) => {
    addresses.forEach(async (address) => {
      const activePrice = await getActivePrice(address);
      getPairAddressTokens(address).then(async (tokens) => {
        if (!tokens) return;

        const token0Value = await getTokenValue(tokens[0]);
        const token1Value = await getTokenValue(tokens[1]);

        if (!token0Value || !token1Value) return;

        getLockedReserves(address).then((r) => {
          const token0Locked = r[0];
          const token1Locked = r[1];
          const usdLocked =
            Number(token0Locked / BigInt(10 ** 9)) * token0Value +
            Number(token1Locked / BigInt(10 ** 9)) * token1Value;
          createAnalytic(
            address,
            token0Locked,
            token1Locked,
            Math.round(usdLocked),
            activePrice
          );
        });
      });
    });
  });
};

const createAnalytic = (
  poolAddress: string,
  token0Locked: bigint,
  token1Locked: bigint,
  usdLocked: number,
  close: number
) => {
  const date = new Date();
  date.setHours(date.getHours(), date.getMinutes(), 0, 0);

  prisma.analytics
    .create({
      data: {
        poolAddress,
        date,
        token0Locked,
        token1Locked,
        usdLocked,
        volume: 0,
        fees: 0,
        close: close,
        high: close,
        low: close,
        open: close,
      },
    })
    .then((p) => logger.info(p))
    .catch((err) => logger.warn(err));
};

const every5Minutes = "*/5 * * * *";
const everyPeriod = "*/16 * * * * *";

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
