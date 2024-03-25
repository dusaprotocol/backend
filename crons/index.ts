import { ILBPair, TokenAmount } from "@dusalabs/sdk";
import { handlePrismaError, prisma } from "../common/db";
import logger from "../common/logger";
import {
  adjustPrice,
  calculateUSDValue,
  getPriceFromId,
  toToken,
} from "../common/methods";
import { web3Client } from "../common/client";
import { getTokenValue } from "../common/datastoreFetcher";
import {
  ONE_DAY,
  TICKS_PER_DAY,
  ONE_TICK,
  getClosestTick,
} from "../common/utils";
import { createAnalytic, getHighLow } from "../indexer/src/db";
import { Prisma } from "@prisma/client";

type Pool = Prisma.PoolGetPayload<{ include: { token0: true; token1: true } }>;

const fillMissingTicks = async (
  pool: Pool,
  ticks: Prisma.AnalyticsGetPayload<{}>[]
) => {
  for (let i = 0; i < TICKS_PER_DAY; i++) {
    const date = getClosestTick(Date.now() - ONE_DAY + i * ONE_TICK);
    if (!ticks.find((tick) => tick.date.getTime() === date.getTime())) {
      const success = await main(pool, date.getTime());
      console.log("missing tick", date, "success", success);
    }
  }
};

const main = async (pool: Pool, now = Date.now()) => {
  logger.silly(`[${new Date().toString()}]: ${pool.address}`);

  const { address: poolAddress, binStep } = pool;
  const [token0, token1] = [pool.token0, pool.token1].map((token) =>
    toToken(token)
  );
  const pairInfo = await new ILBPair(
    poolAddress,
    web3Client
  ).getReservesAndId();

  const { reserveX: token0Locked, reserveY: token1Locked } = pairInfo;
  const [token0Value, token1Value] = await Promise.all([
    getTokenValue(token0),
    getTokenValue(token1),
  ]);
  const usdLocked = calculateUSDValue(
    new TokenAmount(token0, token0Locked),
    token0Value,
    new TokenAmount(token1, token1Locked),
    token1Value
  );

  const volumes = await prisma.swap.findMany({
    where: {
      poolAddress,
      timestamp: {
        gte: getClosestTick(now - ONE_DAY),
        lt: getClosestTick(now),
      },
    },
    select: {
      amountIn: true,
      amountOut: true,
      swapForY: true,
    },
  });
  const volumeX = volumes.reduce(
    (acc, curr) => acc + BigInt(curr.swapForY ? curr.amountIn : curr.amountOut),
    0n
  );
  const volumeY = volumes.reduce(
    (acc, curr) => acc + BigInt(curr.swapForY ? curr.amountOut : curr.amountIn),
    0n
  );

  const { volume, fees } = await prisma.swap
    .aggregate({
      where: {
        poolAddress,
        timestamp: {
          gte: getClosestTick(now - ONE_TICK),
          lt: getClosestTick(now),
        },
      },
      _sum: {
        usdValue: true,
        feesUsdValue: true,
      },
    })
    .then((res) => {
      return {
        volume: Math.round(res._sum.usdValue || 0),
        fees: res._sum.feesUsdValue || 0,
      };
    });

  const openId = pairInfo.activeId;
  const { highId, lowId } = await getHighLow(
    poolAddress,
    getClosestTick(now - ONE_TICK),
    getClosestTick(now)
  );
  const [open, high, low] = [openId, highId || openId, lowId || openId].map(
    (binId) =>
      adjustPrice(
        getPriceFromId(binId, binStep),
        token0.decimals,
        token1.decimals
      )
  );
  if (!open) throw new Error("Invalid price");

  const lastTick = getClosestTick(now - ONE_TICK);
  await prisma.analytics
    .update({
      where: {
        poolAddress_date: {
          poolAddress,
          date: lastTick,
        },
      },
      data: {
        close: open,
        high,
        low,
      },
    })
    .catch(handlePrismaError);

  return createAnalytic({
    poolAddress,
    date: getClosestTick(now),
    token0Locked: token0Locked.toString(),
    token1Locked: token1Locked.toString(),
    usdLocked,
    volume0: volumeX.toString(),
    volume1: volumeY.toString(),
    volume,
    fees,
    open,
    close: open,
    high: open,
    low: open,
  });
};

(async () => {
  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  pools.forEach(async (pool) => {
    await main(pool);
    // const ticks = await prisma.analytics.findMany({
    //   where: {
    //     poolAddress: pool.address,
    //     date: {
    //       gte: getClosestTick(Date.now() - ONE_DAY),
    //     },
    //   },
    // });
    // console.log(ticks.length, TICKS_PER_DAY);
    // await fillMissingTicks(pool, ticks);
  });
})();
