import cron from "node-cron";
import { prisma } from "../../common/db";
import { web3Client } from "../../common/client";
import logger from "../../common/logger";
import {
  getTokenValue,
  getPriceFromId,
  toFraction,
  getTokenFromAddress,
  adjustPrice,
} from "../../common/methods";
import { Pool, Prisma } from "@prisma/client";
import { EVERY_TICK, getClosestTick } from "../../common/utils";
import {
  ILBPair,
  LBPairReservesAndId,
  PairV2,
  Token,
  TokenAmount,
} from "@dusalabs/sdk";

const getPools = (): Promise<Pool[]> =>
  prisma.pool.findMany().catch((e) => {
    logger.warn(e);
    return [];
  });

const fillAnalytics = () => {
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

  const tokens = await new ILBPair(poolAddress, web3Client).getTokens();
  const [token0, token1] = await Promise.all(tokens.map(getTokenFromAddress));

  const { reserveX: token0Locked, reserveY: token1Locked } = pairInfo;
  const usdLocked = await calculateUSDLocked(
    token0,
    token0Locked,
    token1,
    token1Locked
  );

  const adjustedPrice = adjustPrice(
    getPriceFromId(pairInfo.activeId, binStep),
    token0.decimals,
    token1.decimals
  );

  createAnalytic({
    poolAddress,
    token0Locked: token0Locked.toString(),
    token1Locked: token1Locked.toString(),
    usdLocked,
    close: adjustedPrice,
    high: adjustedPrice,
    low: adjustedPrice,
    open: adjustedPrice,
  });
};

export const calculateUSDLocked = async (
  token0: Token,
  token0Locked: bigint,
  token1: Token,
  token1Locked: bigint
): Promise<number> => {
  const [token0Value, token1Value] = await Promise.all(
    [token0, token1].map((token) => getTokenValue(token.address, true))
  );
  const usdLocked = new TokenAmount(token0, token0Locked)
    .multiply(toFraction(token0Value))
    .add(
      new TokenAmount(token1, token1Locked).multiply(toFraction(token1Value))
    )
    .toSignificant(6);
  return Number(usdLocked);
};

export const createAnalytic = async (
  args: Omit<Prisma.AnalyticsUncheckedCreateInput, "date" | "volume" | "fees">
) => {
  const date = getClosestTick();

  return prisma.analytics
    .create({
      data: {
        ...args,
        date,
        volume: 0,
        fees: 0,
      },
    })
    .catch((err) => {
      logger.warn(err);
    });
};

if (!cron.validate(EVERY_TICK)) throw new Error("Invalid cron expression");
export const analyticsCron = cron.schedule(EVERY_TICK, fillAnalytics, {
  scheduled: false,
});
