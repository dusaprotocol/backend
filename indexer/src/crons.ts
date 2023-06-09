import cron from "node-cron";
import { prisma } from "../../src/db";
import { dcaSC } from "./contracts";
import { processEvents } from "../src/socket";
import { ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../../src/client";

const getPairAddresses = () =>
  prisma.price
    .findMany({
      select: {
        address: true,
      },
      distinct: ["address"],
    })
    .then((res) => res.map((r) => r.address))
    .catch((e) => {
      console.log(e);
      return [];
    });

const fillPrice = () => {
  console.log("running the price task");

  getPairAddresses().then((addresses) => {
    addresses.forEach((address) => {
      prisma.price
        .findFirst({
          where: {
            address,
          },
          orderBy: {
            date: "desc",
          },
        })
        .then((price) => {
          if (!price) {
            return;
          }

          const date = new Date();
          date.setHours(date.getHours(), 0, 0, 0);

          prisma.price
            .create({
              data: {
                address,
                date,
                close: price.close,
                high: price.close,
                low: price.close,
                open: price.close,
              },
            })
            .then((p) => console.log(p))
            .catch((e) => console.log(e));
        })
        .catch((e) => console.log(e));
    });
  });
};

const fillAnalytics = () => {
  console.log("running the volume & TVL task");

  getPairAddresses().then((addresses) => {
    const date = new Date();
    date.setHours(date.getUTCHours(), 0, 0, 0);

    addresses.forEach((address) => {
      prisma.analytics
        .findFirst({
          where: {
            address,
          },
          orderBy: {
            date: "desc",
          },
        })
        .then((analytic) => {
          if (!analytic) return;

          prisma.analytics
            .create({
              data: {
                address,
                date,
                token0Locked: analytic.token0Locked,
                token1Locked: analytic.token1Locked,
                volume: 0,
                fees: 0,
              },
            })
            .then((t) => console.log(t))
            .catch((e) => console.log(e));
        });
    });
  });
};

const everyHour = "0 0 */1 * * *" as const;
const everyPeriod = "*/16 * * * * *" as const;

export const priceTask = cron.schedule(everyHour, fillPrice, {
  scheduled: false,
});
export const analyticsTask = cron.schedule(everyHour, fillAnalytics, {
  scheduled: false,
});

let slot: ISlot;

const processAutonomousEvents = async () => {
  console.log("running the autonomous events task for period", slot.period);

  if (!slot)
    slot = await web3Client
      .publicApi()
      .getNodeStatus()
      .then((r) => ({
        period: r.last_slot.period - 5,
        thread: 0,
      }));

  const start = slot;
  const end = { ...slot, thread: 31 };
  web3Client
    .smartContracts()
    .getFilteredScOutputEvents({
      emitter_address: dcaSC,
      is_final: null,
      original_caller_address: null,
      original_operation_id: null,
      start,
      end,
    })
    .then((events) => {
      console.log(events.map((e) => e.data));
      processEvents("", "swap", events.slice(1));
      slot.period += 1;
    });
};

export const autonomousEvents = cron.schedule(
  everyPeriod,
  processAutonomousEvents,
  {
    scheduled: false,
  }
);
