import { Analytics, Price, PrismaClient } from "@prisma/client";
import { getActivePrice, getCallee } from "../../common/methods";

const prisma = new PrismaClient();

interface Pool {
  address: string;
  binStep: number;
  activeId: number;
}

const pools: Pool[] = [
  {
    // USDC-ETH
    address: "AS12B2SUnD5mqHkTC1gBfmm58F8CBqC1oxHAgEF53EV4XLK6jz4GZ",
    binStep: 10,
    activeId: 138585,
  },
  {
    // USDC-MASSA
    address: "AS12KbcXyR5vcpVP3FrzZob866K7qud3youLVDDvcBNjgXofw8GZN",
    binStep: 20,
    activeId: 131887,
  },
  {
    // MASSA-WETH
    address: "AS1MBXDj3UuXyngTGGvPHeKLjBasVxCiJ7zAXqo3izeQBmpG536C",
    binStep: 15,
    activeId: 135005,
  },
];
const betaLaunch = new Date(1684332000 * 1000).getTime();

async function generateAnalytics(pool: Pool) {
  const data: Analytics[] = [];

  let prevValue = 5000;
  for (let i = 0; i < 720; i++) {
    const value = 0;
    const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);
    const date = new Date(Date.now() - 1000 * 60 * 60 * i);
    date.setHours(date.getHours(), 0, 0, 0);

    data.push({
      address: pool.address,
      date,
      token0Locked: BigInt(value),
      token1Locked: BigInt(value),
      usdLocked: value,
      volume: BigInt(value),
      fees: BigInt(Math.round(value / 1000)),
    });

    prevValue = value;
  }

  prisma.analytics
    .createMany({
      data,
    })
    .catch((err) => console.error(err));
}

async function generatePrices(pool: Pool) {
  const data: Price[] = [];

  let close = await getActivePrice(pool.address);
  for (let j = 0; j < 720; j++) {
    const open = close;
    const high = close;
    const low = close;

    const date = new Date(betaLaunch - 1000 * 60 * 60 * j);
    date.setHours(date.getHours(), 0, 0, 0);

    data.push({
      address: pool.address,
      date,
      open,
      close,
      high,
      low,
    });
    close = open;
  }

  await prisma.price
    .createMany({
      data,
    })
    .catch((err) => console.error(err));
}

async function createMissingPrices(pool: Pool) {
  const data: Price[] = [];
  const lastMonthPrices = await prisma.price.findMany({
    where: {
      address: pool.address,
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
        const missingData: Price = {
          address: pool.address,
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
  await prisma.price
    .createMany({
      data,
    })
    .then((res) => console.log(res))
    .catch((err) => console.error(err));
}

(() => {
  // for (const pool of pools) {
  //   generateAnalytics(pool);
  //   generatePrices(pool);
  // }

  prisma.analytics
    .updateMany({
      where: {
        token0Locked: {
          lt: BigInt(0),
        },
        OR: {
          token1Locked: {
            lt: BigInt(0),
          },
        },
      },
      data: {
        token0Locked: BigInt(0),
        token1Locked: BigInt(0),
      },
    })
    .then((res) => console.log(res))
    .catch((err) => console.error(err));
})();
