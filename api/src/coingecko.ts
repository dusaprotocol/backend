import { TokenAmount } from "@dusalabs/sdk";
import { prisma } from "../../common/db";
import { ONE_DAY, ONE_TICK, getClosestTick } from "../../common/utils";
import {
  adjustPrice,
  getIdFromPrice,
  getPriceFromId,
  toToken,
} from "../../common/methods";
import { getHighLow } from "../../indexer/src/db";

interface Ticker {
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  pool_id: string;
  last_price: string;
  base_volume: string;
  target_volume: string;
  liquidity_in_usd: string;
  high: string;
  low: string;
}

export const getTickers = async (): Promise<Ticker[]> => {
  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  return Promise.all(
    pools.map(async (pool): Promise<Ticker> => {
      const { token0, token1 } = pool;
      const volumes = await prisma.analytics.findMany({
        select: {
          volume0: true,
          volume1: true,
          open: true,
          usdLocked: true,
        },
        where: {
          poolAddress: pool.address,
          date: { gte: getClosestTick(Date.now() - ONE_DAY) },
        },
      });
      const base_volume = volumes.reduce(
        (acc, { volume0 }) => acc + BigInt(volume0),
        0n
      );
      const target_volume = volumes.reduce(
        (acc, { volume1 }) => acc + BigInt(volume1),
        0n
      );

      const liquidity_in_usd = volumes[volumes.length - 1].usdLocked;
      const open = volumes[volumes.length - 1].open;
      const openId = getIdFromPrice(open, pool.binStep);

      const { highId, lowId } = await getHighLow(
        pool.address,
        getClosestTick(Date.now() - ONE_TICK),
        getClosestTick(Date.now())
      );
      const [high, low] = [highId, lowId].map((binId) =>
        binId
          ? adjustPrice(
              getPriceFromId(binId, pool.binStep),
              token0.decimals,
              token1.decimals
            )
          : open
      );

      return {
        ticker_id: `${token0.symbol}_${token1.symbol}`,
        base_currency: token0.symbol,
        target_currency: token1.symbol,
        pool_id: pool.address,
        last_price: open.toString(),
        base_volume: new TokenAmount(
          toToken(token0),
          base_volume
        ).toSignificant(),
        target_volume: new TokenAmount(
          toToken(token1),
          target_volume
        ).toSignificant(),
        liquidity_in_usd: liquidity_in_usd.toString(),
        high: high.toString(),
        low: low.toString(),
      };
    })
  );
};
