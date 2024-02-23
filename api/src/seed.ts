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

type AddressBinStep = Pick<Pool, "address" | "binStep">;

const createPools = async (generate = false) => {
  // await new IFactory(factorySC, web3Client).getEveryLBPairAddresses()
  const pairAddresses = await web3Client
    .publicApi()
    .getDatastoreEntries([{ address: factorySC, key: strToBytes("ALL_PAIRS") }])
    .then(async (res) => {
      const bs = res[0].final_value;
      if (!bs) return [];

      return bytesToStr(bs)
        .split(":")
        .filter((s) => s);
    });

  const pools: AddressBinStep[] = await Promise.all(
    pairAddresses.map(async (pair) => {
      const binStep = await getBinStep(pair);
      return { address: pair, binStep };
    })
  );

  pools.forEach(async (pool) => {
    await createPair(pool);

    // await 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (generate) generateDataset(pool.address);
  });
};

const createPair = async (pool: AddressBinStep) => {
  const [token0Address, token1Address] = await new ILBPair(
    pool.address,
    web3Client
  ).getTokens();

  try {
    await createToken(token0Address);
    await createToken(token1Address);

    await prisma.pool
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
    console.error({ err });
  }
};

export const createToken = async (address: string) => {
  const token = new IERC20(address, web3Client);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);
  return prisma.token
    .upsert({
      where: {
        address,
      },
      create: {
        address,
        name,
        symbol,
        decimals,
      },
      update: {},
    })
    .then(console.log)
    .catch(console.error);
};

const generateDataset = async (poolAddress: string) => {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { address: poolAddress },
    include: { token0: true, token1: true },
  });
  const pairInfo = await new ILBPair(
    pool.address,
    web3Client
  ).getReservesAndId();
  let prevPrice = adjustPrice(
    getPriceFromId(pairInfo.activeId, pool.binStep),
    pool.token0.decimals,
    pool.token1.decimals
  );

  const data: Prisma.AnalyticsCreateManyArgs["data"] = [];
  for (let i = 0; i < TICKS_PER_DAY * 30; i++) {
    const date = getClosestTick(Date.now() - i * TIME_BETWEEN_TICKS);
    if (prevPrice === 1) {
      data.push({
        poolAddress: pool.address,
        token0Locked: "0",
        token1Locked: "0",
        usdLocked: 0,
        close: 1,
        high: 1,
        low: 1,
        open: 1,
        date,
        fees: 0,
        volume: 0,
      });
      continue;
    }

    const price = prevPrice * (1 + rand());
    const open = price;
    const close = prevPrice;
    const max = Math.max(prevPrice, price);
    const min = Math.min(prevPrice, price);
    const high = Math.random() > 0.5 ? max * (1 + rand()) : max;
    const low = Math.random() > 0.5 ? min * (1 - rand()) : min;
    prevPrice = price;

    data.push({
      poolAddress: pool.address,
      token0Locked: "0",
      token1Locked: "0",
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

  await prisma.analytics
    .createMany({ data })
    .then(console.log)
    .catch(console.error);
};

const rand = () => Math.random() * 0.01 - 0.005;

(async () => {
  createPools();
})();
