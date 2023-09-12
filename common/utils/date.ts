import { ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../client";

export const parseSlot = (slot: ISlot, genesisTimestamp: number): number =>
  genesisTimestamp + slot.period * 16 * 1000 + (slot.thread / 2) * 1000;

export const parseTimestamp = (
  timestamp: number,
  genesisTimestamp: number
): ISlot => {
  const elapsedInMs = timestamp - genesisTimestamp;

  return {
    period: Math.floor(elapsedInMs / PERIOD_DURATION),
    thread: Math.floor(((elapsedInMs % PERIOD_DURATION) / 1000) * 2),
  };
};

export const getGenesisTimestamp = () =>
  web3Client
    .publicApi()
    .getNodeStatus()
    .then((status) => status.config.genesis_timestamp);

// CONSTANTS (in ms)
export const ONE_DAY = 24 * 60 * 60 * 1000;
export const ONE_HOUR = 60 * 60 * 1000;
export const TIME_BETWEEN_TICKS = 5 * 60 * 1000;
export const PERIOD_DURATION = 16_000;

export const EVERY_TICK = "*/5 * * * *" as const;
export const EVERY_PERIOD = "*/16 * * * * *" as const;
