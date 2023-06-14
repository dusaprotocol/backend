import { Analytics, Price, PrismaClient } from "@prisma/client";
import { web3Client } from "../common/client";
import { getActivePrice, getCallee } from "../common/methods";
import { getGenesisTimestamp, parseSlot } from "../common/utils";
import { addTvl } from "../indexer/src/socket";

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
      volume: BigInt(value),
      fees: BigInt(Math.round(value / 1000)),
    });

    prevValue = value;
  }

  prisma.analytics
    .createMany({
      data,
    })
    .catch((err) => logger.error(err));
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
    .catch((err) => logger.error(err));
}

async function trackPastTVL() {
  const genesisTimestamp = getGenesisTimestamp();

  const events = await web3Client.smartContracts().getFilteredScOutputEvents({
    start: null,
    end: null,
    emitter_address: null, //pool.address
    original_caller_address: null,
    original_operation_id: null,
    is_final: null,
  });
  // const filtered = events.filter((e) => getCallee(e) === pool.address);
  const filtered = events.filter(
    (e) =>
      e.data.startsWith("DEPOSITED_TO_BIN:") ||
      e.data.startsWith("REMOVED_FROM_BIN:")
  );
  filtered.forEach((e) => {
    if (
      e.data.startsWith("DEPOSITED_TO_BIN:") ||
      e.data.startsWith("REMOVED_FROM_BIN:")
    ) {
      const isAdd = e.data.startsWith("DEPOSITED_TO_BIN:");
      const [_to, _binId, amountX, amountY] = e.data.split(",");
      const date = parseSlot(e.context.slot, genesisTimestamp);

      addTvl(
        getCallee(e), //pool.address
        isAdd ? Number(amountX) : Number(-amountX),
        isAdd ? Number(amountY) : Number(-amountY),
        new Date(date)
      );
    }
  });
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
    .catch((err) => logger.error(err));
}

(() => {
  for (const pool of pools) {
    generateAnalytics(pool);
    generatePrices(pool);
  }
})();
