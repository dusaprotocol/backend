import cron from "node-cron";
import { prisma } from "../../common/db";
import { web3Client } from "../../common/client";
import logger from "../../common/logger";
import {
  getPairAddressTokens,
  getTokenValue,
  getPriceFromId,
  toFraction,
  getTokenFromAddress,
} from "../../common/methods";
import { Pool } from "@prisma/client";
import { EVERY_TICK, getClosestTick } from "../../common/utils";
import { PairV2, Token, TokenAmount } from "@dusalabs/sdk";

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
  const tokens = await getPairAddressTokens(poolAddress);
  if (!tokens) return;

  const token0 = await getTokenFromAddress(tokens[0]);
  const token1 = await getTokenFromAddress(tokens[1]);
  if (!token0 || !token1) return;

  const token0Value = await getTokenValue(tokens[0], false);
  const token1Value = await getTokenValue(tokens[1], false);
  if (!token0Value || !token1Value) return;

  const token0Locked = pairInfo.reserveX;
  const token1Locked = pairInfo.reserveY;

  const usdLocked = new TokenAmount(token0, token0Locked)
    .multiply(toFraction(token0Value))
    .add(
      new TokenAmount(token1, token1Locked).multiply(toFraction(token1Value))
    )
    .toSignificant(6);

  const adjustedPrice = activePrice * 10 ** (token0.decimals - token1.decimals);

  createAnalytic(
    poolAddress,
    token0Locked.toString(),
    token1Locked.toString(),
    Number(usdLocked),
    adjustedPrice
  );

  return {
    adjustedPrice,
    token0Locked,
    token1Locked,
  };
};

const createAnalytic = (
  poolAddress: string,
  token0Locked: string,
  token1Locked: string,
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
