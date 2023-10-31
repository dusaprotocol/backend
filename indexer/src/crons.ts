import cron from "node-cron";
import { prisma } from "../../common/db";
import { web3Client } from "../../common/client";
import logger from "../../common/logger";
import {
  getPairAddressTokens,
  getTokenValue,
  getPriceFromId,
  fetchTokenInfo,
} from "../../common/methods";
import { Pool } from "@prisma/client";
import { EVERY_TICK, getClosestTick } from "../../common/utils";
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
      fetchNewAnalytics(pool.address, pool.binStep).catch(
        (e) => logger.warn(e.message) && logger.warn(e.toString())
      );
    });
  });
};

export const fetchNewAnalytics = async (
  poolAddress: string,
  binStep: number
) => {
  const pairInfo = await PairV2.getLBPairReservesAndId(poolAddress, web3Client);
  if (!pairInfo) return;

  const activePrice = getPriceFromId(pairInfo.activeId, binStep);
  getPairAddressTokens(poolAddress).then(async (tokens) => {
    if (!tokens) return;

    const token0Decimals = await fetchTokenInfo(tokens[0]).then(
      (e) => e && e.decimals
    );
    const token1Decimals = await fetchTokenInfo(tokens[1]).then(
      (e) => e && e.decimals
    );
    if (!token0Decimals || !token1Decimals) return;

    const token0Value = await getTokenValue(tokens[0]);
    const token1Value = await getTokenValue(tokens[1]);
    if (!token0Value || !token1Value) return;

    const token0Locked = pairInfo.reserveX;
    const token1Locked = pairInfo.reserveY;
    const usdLocked =
      Number(token0Locked / BigInt(10 ** token0Decimals)) * token0Value +
      Number(token1Locked / BigInt(10 ** token1Decimals)) * token1Value;

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

if (!cron.validate(EVERY_TICK)) throw new Error("Invalid cron expression");
export const analyticsCron = cron.schedule(EVERY_TICK, fillAnalytics, {
  scheduled: false,
});
