import cron from "node-cron";
import { ISlot, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "../../common/db";
import { dcaSC, factorySC } from "../../common/contracts";
import { web3Client } from "../../common/client";
// import { processEvents } from "./socket";
import logger from "../../common/logger";
import {
  getPairInformation,
  getPairAddressTokens,
  getTokenValue,
  getPriceFromId,
} from "../../common/methods";
import { Args } from "@massalabs/massa-web3";
import { Pool } from "@prisma/client";
import { fetchEvents } from "../../common/utils";

const getPools = (): Promise<Pool[]> =>
  prisma.pool.findMany().catch((e) => {
    logger.warn(e);
    return [];
  });

// web3Client
//   .publicApi()
//   .getAddresses([factorySC])
//   .then(async (res) => {
//     const keys = res[0].final_datastore_keys
//       .map((k) => String.fromCharCode(...k))
//       .filter((k) => k.startsWith("PAIR_INFORMATION::"));
//     return web3Client
//       .publicApi()
//       .getDatastoreEntries(
//         keys.map((k) => ({ key: strToBytes(k), address: factorySC }))
//       )
//       .then((r) =>
//         r.reduce((acc, entry) => {
//           if (entry.final_value) {
//             const pairInformation = new Args(entry.final_value);
//             const binStep = pairInformation.nextU32();
//             const pairAddress = pairInformation.nextString();
//             acc.push(pairAddress);
//           }
//           return acc;
//         }, [] as string[])
//       );
//   });

export const fillAnalytics = () => {
  logger.silly(`running the analytics task at ${new Date().toString()}`);

  getPools().then((pools) => {
    pools.forEach(async (pool) => {
      const pairInfo = await getPairInformation(pool.address);
      if (!pairInfo) return;

      const activePrice = getPriceFromId(pairInfo.activeId, pool.binStep);
      getPairAddressTokens(pool.address).then(async (tokens) => {
        if (!tokens) return;

        const token0Value = await getTokenValue(tokens[0]);
        const token1Value = await getTokenValue(tokens[1]);

        if (!token0Value || !token1Value) return;

        const token0Locked = pairInfo.reserveX;
        const token1Locked = pairInfo.reserveY;
        const usdLocked =
          Number(token0Locked / BigInt(10 ** 9)) * token0Value +
          Number(token1Locked / BigInt(10 ** 9)) * token1Value;
        createAnalytic(
          pool.address,
          token0Locked,
          token1Locked,
          Math.round(usdLocked),
          activePrice
        );
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
    .then((p) => logger.debug(p))
    .catch((err) => logger.warn(err));
};

const every5Minutes = "*/5 * * * *";
const everyPeriod = "*/16 * * * * *";

export const analyticsTask = cron.schedule(every5Minutes, fillAnalytics, {
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

  // TODO (use GRPC newSlotExecutionOutputs?)

  // fetchEvents({ emitter_address: dcaSC, start, end }).then((events) => {
  //   logger.silly(events.map((e) => e.data));

  //   const txId = "";
  //   const creatorAddress = "";
  //   processEvents(txId, creatorAddress, "swap", events.slice(1));
  //   slot.period += 1;
  // });
};

export const autonomousEvents = cron.schedule(
  everyPeriod,
  processAutonomousEvents,
  {
    scheduled: false,
  }
);
