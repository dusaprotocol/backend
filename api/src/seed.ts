import { PrismaClient } from "@prisma/client";
import type { Analytics, Pool } from "@prisma/client";
import {
  fetchTokenInfo,
  getPairInformation,
  getBinStep,
  getCallee,
  getPairAddressTokens,
  getPriceFromId,
} from "../../common/methods";
import { web3Client } from "../../common/client";
import { factorySC } from "../../common/contracts";
import { Args, bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { ONE_DAY, TIME_BETWEEN_TICKS } from "../../common/utils/date";

const prisma = new PrismaClient();

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

        const binStep = await getBinStep(pair);
        if (!binStep) continue;

        pools.push({
          address: pair,
          binStep,
        });
      }
    });

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    console.log(pool.binStep);
    const tokenAddresses = await getPairAddressTokens(pool.address);
    if (!tokenAddresses) return;

    const [token0Address, token1Address] = tokenAddresses;
    const token0 = await fetchTokenInfo(token0Address);
    const token1 = await fetchTokenInfo(token1Address);
    if (!token0 || !token1) return;

    try {
      await prisma.token.upsert({
        where: {
          address: token0.address,
        },
        create: token0,
        update: {},
      });
      await prisma.token.upsert({
        where: {
          address: token1.address,
        },
        create: token1,
        update: {},
      });

      prisma.pool
        .create({
          data: {
            ...pool,
            token0: {
              connect: {
                address: token0.address,
              },
            },
            token1: {
              connect: {
                address: token1.address,
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

async function generateAnalytics(pool: Pool) {
  const data: Analytics[] = [];

  let prevValue = 5000;
  for (let i = 0; i < 720; i++) {
    let pairInfo = await getPairInformation(pool.address);
    if (!pairInfo) return;

    let close = getPriceFromId(pairInfo.activeId, pool.binStep);
    const open = close;
    const high = close;
    const low = close;
    const value = 0;
    const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);

    const date = new Date(Date.now() - TIME_BETWEEN_TICKS * i);
    date.setHours(date.getHours(), 0, 0, 0);

    data.push({
      poolAddress: pool.address,
      date,
      token0Locked: BigInt(value),
      token1Locked: BigInt(value),
      usdLocked: value,
      volume: value,
      fees: Math.round(value / 1000),
      open,
      close,
      high,
      low,
    });

    prevValue = value;
  }

  prisma.analytics
    .createMany({
      data,
    })
    .catch((err) => console.error(err));
}

async function createMissingPrices(pool: Pool) {
  const data: Analytics[] = [];
  const lastMonthPrices = await prisma.analytics.findMany({
    where: {
      poolAddress: pool.address,
      date: {
        gte: new Date(Date.now() - ONE_DAY * 30),
      },
    },
    orderBy: {
      date: "asc",
    },
  });
  for (let i = 0; i < lastMonthPrices.length; i++) {
    if (i === lastMonthPrices.length - 1) break;

    const date = new Date(lastMonthPrices[i].date);
    const nextDate = new Date(lastMonthPrices[i + 1].date);
    const elapsed = nextDate.getTime() - date.getTime();
    if (elapsed !== TIME_BETWEEN_TICKS) {
      const missingHours = Math.floor(elapsed / TIME_BETWEEN_TICKS);
      console.log(missingHours, date, nextDate);

      for (let j = 1; j < missingHours; j++) {
        const missingData: Analytics = {
          ...lastMonthPrices[i],
          date: new Date(date.getTime() + TIME_BETWEEN_TICKS * j),
          open: lastMonthPrices[i].close,
          close: lastMonthPrices[i].close,
          high: lastMonthPrices[i].close,
          low: lastMonthPrices[i].close,
        };
        data.push(missingData);
      }
    }
  }
  await prisma.analytics
    .createMany({
      data,
    })
    .then((res) => console.log(res))
    .catch((err) => console.error(err));
}

(() => {
  createPools();
})();
