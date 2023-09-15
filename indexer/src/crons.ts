import cron from "node-cron";
import { ISlot, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "../../common/db";
import { dcaSC, factorySC } from "../../common/contracts";
import { web3Client } from "../../common/client";
// import { processEvents } from "./socket";
import logger from "../../common/logger";
import {
  getPairAddressTokens,
  getTokenValue,
  getPriceFromId,
} from "../../common/methods";
import { Pool } from "@prisma/client";
import { EVERY_PERIOD, EVERY_TICK, getClosestTick } from "../../common/utils";
import { PairV2 } from "@dusalabs/sdk";

const getPools = (): Promise<Pool[]> =>
  prisma.pool.findMany().catch((e) => {
    logger.warn(e);
    return [];
  });

export const fillAnalytics = () => {
  logger.silly(`running the analytics task at ${new Date().toString()}`);

  getPools().then((pools) => {
    pools.forEach(async (pool) => {
      fetchNewAnalytics(pool.address, pool.binStep);
    });
  });
};

const fetchNewAnalytics = async (poolAddress: string, binStep: number) => {
  const pairInfo = await PairV2.getLBPairReservesAndId(poolAddress, web3Client);
  if (!pairInfo) return;

  const activePrice = getPriceFromId(pairInfo.activeId, binStep);
  getPairAddressTokens(poolAddress).then(async (tokens) => {
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
      poolAddress,
      token0Locked,
      token1Locked,
      Math.round(usdLocked),
      activePrice
    );
  });
};

const createAnalytic = (
  poolAddress: string,
  token0Locked: bigint,
  token1Locked: bigint,
  usdLocked: number,
  close: number,
  open = close,
  high = close,
  low = close
) => {
  const date = getClosestTick(Date.now());

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
        close,
        high,
        low,
        open,
      },
    })
    .then((p) => logger.debug(p))
    .catch((err) => logger.warn(err));
};

export const analyticsTask = cron.schedule(EVERY_TICK, fillAnalytics, {
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
  EVERY_PERIOD,
  processAutonomousEvents,
  {
    scheduled: false,
  }
);
