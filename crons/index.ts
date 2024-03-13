import { ILBPair, TokenAmount } from "@dusalabs/sdk";
import { prisma } from "../common/db";
import logger from "../common/logger";
import {
  adjustPrice,
  calculateUSDValue,
  getPriceFromId,
  toToken,
} from "../common/methods";
import { web3Client } from "../common/client";
import { getTokenValue } from "../common/datastoreFetcher";
import { TIME_BETWEEN_TICKS, getClosestTick } from "../common/utils";
import { createAnalytic } from "../indexer/src/db";

(async () => {
  logger.silly(`[${new Date().toISOString()}]: running the analytics task`);

  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  pools.forEach(async (pool) => {
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

    const { volume, fees } = await prisma.swap
      .aggregate({
        where: {
          poolAddress,
          timestamp: {
            gte: new Date(Date.now() - TIME_BETWEEN_TICKS),
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
    const { highId, lowId } = await prisma.swap
      .aggregate({
        where: {
          poolAddress,
          timestamp: {
            gte: new Date(Date.now() - TIME_BETWEEN_TICKS),
          },
        },
        _max: {
          binId: true,
        },
        _min: {
          binId: true,
        },
      })
      .then((res) => {
        return {
          highId: res._max.binId || openId,
          lowId: res._min.binId || openId,
        };
      });
    const [open, high, low] = [openId, highId, lowId].map((binId) =>
      adjustPrice(
        getPriceFromId(binId, binStep),
        token0.decimals,
        token1.decimals
      )
    );
    if (!open) throw new Error("Invalid price");

    // update previous tick with close, high and low
    await prisma.analytics
      .update({
        where: {
          poolAddress_date: {
            poolAddress,
            date: getClosestTick(Date.now() - TIME_BETWEEN_TICKS),
          },
        },
        data: {
          close: open,
          high,
          low,
        },
      })
      .catch(() => logger.warn("failed to update previous tick"));

    return createAnalytic({
      poolAddress,
      token0Locked: token0Locked.toString(),
      token1Locked: token1Locked.toString(),
      usdLocked,
      volume,
      fees,
      open,
      close: open,
      high: open,
      low: open,
    });
  });
})();
