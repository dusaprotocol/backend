import { ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../client";

// Constants (in ms)
export const ONE_MINUTE = 60 * 1000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const ONE_PERIOD = 16_000;

// (changes here should be reflected in the interface)
export const TIME_BETWEEN_TICKS = 5 * ONE_MINUTE;
export const TICKS_PER_DAY = ONE_DAY / TIME_BETWEEN_TICKS;

// Cron expressions
export const EVERY_TICK = "*/5 * * * *" as const;
export const EVERY_PERIOD = "*/16 * * * * *" as const;

export const parseSlot = (slot: ISlot, genesisTimestamp: number): number =>
  genesisTimestamp + slot.period * 16 * 1000 + (slot.thread / 2) * 1000;

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

export const getGenesisTimestamp = () =>
  web3Client
    .publicApi()
    .getNodeStatus()
    .then((status) => status.config.genesis_timestamp);

export const getClosestTick = (timestamp: number): Date => {
  const ticks = Math.floor(timestamp / TIME_BETWEEN_TICKS) * TIME_BETWEEN_TICKS;
  return new Date(ticks);
};
