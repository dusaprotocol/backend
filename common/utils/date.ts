import { IEvent, ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../client";

// Constants (in ms)
export const ONE_MINUTE = 60 * 1000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const ONE_PERIOD = 16_000;

// (changes here should be reflected in the interface)
export const ONE_TICK = 5 * ONE_MINUTE;
export const TICKS_PER_DAY = ONE_DAY / ONE_TICK;

// Cron expressions
export const EVERY_TICK = "*/5 * * * *" as const;
export const EVERY_PERIOD = "*/16 * * * * *" as const;

// UNIX timestamp of the first slot
export const genesisTimestamp = await web3Client
  .publicApi()
  .getNodeStatus()
  .then((r) => r.config.genesis_timestamp);

/**
 * Returns the slot corresponding to the given timestamp
 * @param timestamp
 * @returns
 */
export const parseTimestamp = (
  timestamp: number,
  genesisTimestamp: number
): ISlot => {
  const elapsedInMs = timestamp - genesisTimestamp;

  return {
    period: Math.floor(elapsedInMs / ONE_PERIOD),
    thread: Math.floor(((elapsedInMs % ONE_PERIOD) / 1000) * 2),
  };
};

/**
 * Returns the closest tick to the given timestamp (rounded down)
 * @param timestamp
 * @returns
 */
export const getClosestTick = (timestamp: number = Date.now()): Date => {
  return new Date(Math.floor(timestamp / ONE_TICK) * ONE_TICK);
};

/**
 * Returns the closest hourly tick to the given timestamp (rounded down)
 * @param timestamp
 * @returns
 */
export const getHourlyTick = (timestamp: number = Date.now()): Date => {
  return new Date(Math.floor(timestamp / ONE_HOUR) * ONE_HOUR);
};

/**
 * Returns the closest daily tick to the given timestamp (rounded down)
 * @param timestamp
 * @returns
 */
export const getDailyTick = (timestamp: number = Date.now()): Date => {
  return new Date(Math.floor(timestamp / ONE_DAY) * ONE_DAY);
};
