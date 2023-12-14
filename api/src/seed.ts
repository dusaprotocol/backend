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

const createPools = async () => {
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
    generateDataset(pool.address);
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
  return prisma.token.upsert({
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
  });
};

const generateDataset = async (poolAddress: string) => {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { address: poolAddress },
    include: { token0: true, token1: true },
  });
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
  let prevPrice = price;

  for (let i = 0; i < TICKS_PER_DAY * 30; i++) {
    const date = getClosestTick(Date.now() - i * TIME_BETWEEN_TICKS);
    const reserveX = pairInfo.reserveX - (pairInfo.reserveX / 100n) * BigInt(i);
    const reserveY = pairInfo.reserveY - (pairInfo.reserveY / 100n) * BigInt(i);

    const price = prevPrice * (1 + Math.random() * 0.1 - 0.05);
    const open = price;
    const close = prevPrice;
    const high =
      Math.random() > 0.5
        ? Math.max(prevPrice, price) * (1 + Math.random() * 0.05)
        : Math.max(prevPrice, price);
    const low =
      Math.random() > 0.5
        ? Math.min(prevPrice, price) * (1 - Math.random() * 0.05)
        : Math.min(prevPrice, price);
    prevPrice = price;

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

  await prisma.analytics
    .createMany({ data })
    .then(console.log)
    .catch(console.error);
};

(async () => {
  // // pool Aya
  // const pair = {
  //   address: "AS1sBxofCbHKS2c1y6FqBk48YfQvT46ZdxBzzW5rZB12zpdHCkS3",
  //   binStep: 20,
  // };
  // createPair(pair).then(() => generateDataset(pair.address));
  // createPools();

  // prisma.dCA.deleteMany({}).then(console.log).catch(console.error);
  // prisma.order.deleteMany({}).then(console.log).catch(console.error);

  await prisma.swap
    .create({
      data: {
        amountIn: 0n,
        amountOut: 0n,
        binId: 0,
        timestamp: new Date(),
        usdValue: 0,
        poolAddress: "AS1sBxofCbHKS2c1y6FqBk48YfQvT46ZdxBzzW5rZB12zpdHCkS3",
        swapForY: false,
        txHash: "",
        userAddress: "0x0000000",
      },
    })
    .then(console.log)
    .catch(console.error);
})();
