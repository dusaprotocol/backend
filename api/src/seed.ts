import { Analytics, Pool, PrismaClient } from "@prisma/client";
import {
  fetchTokenInfo,
  getActivePrice,
  getCallee,
  getPairAddressTokens,
} from "../../common/methods";

const prisma = new PrismaClient();

type PartialPool = Pick<Pool, "address" | "binStep">;
const pools: PartialPool[] = [
  {
    // USDC-ETH
    address: "AS1aqPPZGHzZQ4cFvKFuWRwrfV3czsiwXdPazLyWLaBZLj2U9yKd",
    binStep: 10,
  },
  {
    // USDC-MASSA
    address: "AS1TWx6MKHwpSpRa6JAgJEPjW6MC5MgPn2fw8wxWMdPCLet6nAyQ",
    binStep: 20,
  },
  {
    // MASSA-WETH
    address: "AS12NcvXe1wrbKizMH4cfau5guvE9sZKMLZW5S4DsRdmssH2S9F51",
    binStep: 15,
  },
];

async function createPools() {
  pools.forEach(async (pool) => {
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
  });
}

async function generateAnalytics(pool: Pool) {
  const data: Analytics[] = [];

  let prevValue = 5000;
  for (let i = 0; i < 720; i++) {
    let close = await getActivePrice(pool.address);
    const open = close;
    const high = close;
    const low = close;
    const value = 0;
    const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);

    const date = new Date(Date.now() - 1000 * 60 * 60 * i);
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
        gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
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
    const oneHour = 1000 * 60 * 60;
    if (elapsed !== oneHour) {
      const missingHours = Math.floor(elapsed / oneHour);
      console.log(missingHours, date, nextDate);

      for (let j = 1; j < missingHours; j++) {
        const missingData: Analytics = {
          ...lastMonthPrices[i],
          date: new Date(date.getTime() + oneHour * j),
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
