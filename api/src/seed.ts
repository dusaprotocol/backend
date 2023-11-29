import type { Pool, Prisma } from "@prisma/client";
import { adjustPrice, getBinStep, getPriceFromId } from "../../common/methods";
import { web3Client } from "../../common/client";
import { factorySC } from "../../common/contracts";
import { bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "../../common/db";
import { IERC20, ILBPair, PairV2 } from "@dusalabs/sdk";
import {
  TICKS_PER_DAY,
  TIME_BETWEEN_TICKS,
  getClosestTick,
} from "../../common/utils/date";

async function createPools() {
  const pools: Pick<Pool, "address" | "binStep">[] = [];
  await web3Client
    .publicApi()
    .getDatastoreEntries([{ address: factorySC, key: strToBytes("ALL_PAIRS") }])
    .then(async (res) => {
      const bs = res[0].final_value;
      if (!bs) return;

      const pairs = bytesToStr(bs).split(":");
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (!pair) continue;

        const binStep = await getBinStep(pair).catch(() => undefined);
        if (!binStep) continue;

        pools.push({
          address: pair,
          binStep,
        });
      }
    });

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const [token0Address, token1Address] = await new ILBPair(
      pool.address,
      web3Client
    ).getTokens();
    const _token0 = new IERC20(token0Address, web3Client);
    const _token1 = new IERC20(token1Address, web3Client);
    const [name0, symbol0, decimals0] = await Promise.all([
      _token0.name(),
      _token0.symbol(),
      _token0.decimals(),
    ]);
    const [name1, symbol1, decimals1] = await Promise.all([
      _token1.name(),
      _token1.symbol(),
      _token1.decimals(),
    ]);

    try {
      await prisma.token.upsert({
        where: {
          address: token0Address,
        },
        create: {
          address: token0Address,
          decimals: decimals0,
          symbol: symbol0,
          name: name0,
        },
        update: {},
      });
      await prisma.token.upsert({
        where: {
          address: token1Address,
        },
        create: {
          address: token1Address,
          decimals: decimals1,
          symbol: symbol1,
          name: name1,
        },
        update: {},
      });

      prisma.pool
        .create({
          data: {
            ...pool,
            token0: {
              connect: {
                address: token0Address,
              },
            },
            token1: {
              connect: {
                address: token1Address,
              },
            },
          },
        })
        .then((res) => console.log(res))
        .catch((err) => console.error(err));
    } catch (err) {
      console.error(err);
    }
  }
}

async function generateDataset() {
  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  pools.forEach(async (pool) => {
    const pairInfo = await PairV2.getLBPairReservesAndId(
      pool.address,
      web3Client
    );
    const price = adjustPrice(
      getPriceFromId(pairInfo.activeId, pool.binStep),
      pool.token0.decimals,
      pool.token1.decimals
    );

    const data: Prisma.AnalyticsCreateManyArgs["data"] = [];

    for (let i = 0; i < TICKS_PER_DAY * 30; i++) {
      // i day ago
      const date = getClosestTick(Date.now() - i * TIME_BETWEEN_TICKS);
      const reserveX =
        pairInfo.reserveX - (pairInfo.reserveX / 100n) * BigInt(i);
      const reserveY =
        pairInfo.reserveY - (pairInfo.reserveY / 100n) * BigInt(i);
      const close = price;
      const open = close - (close / 100) * (Math.random() * 10);
      const high = open + (open / 100) * (Math.random() * 10);
      const low = open - (open / 100) * (Math.random() * 10);
      data.push({
        poolAddress: pool.address,
        token0Locked: reserveX.toString(),
        token1Locked: reserveY.toString(),
        usdLocked: 0,
        close,
        high,
        low,
        open,
        date,
        fees: 0,
        volume: 0,
      });
    }

    await prisma.analytics.createMany({ data }).then(console.log);
  });
}

(async () => {
  await createPools();
  generateDataset();
})();
