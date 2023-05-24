import { ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../client";

export const parseSlot = (slot: ISlot, genesisTimestamp: number): number =>
    genesisTimestamp + slot.period * 16 * 1000 + (slot.thread / 2) * 1000;

export const parseTimestamp = (
    timestamp: number,
    genesisTimestamp: number
): ISlot => ({
    period: Math.floor((timestamp - genesisTimestamp) / 16 / 1000),
    thread: Math.floor(
        (((timestamp - genesisTimestamp) % (16 * 1000)) / 1000) * 2
    ),
});

export const getGenesisTimestamp = () => 1682247136428;
// web3Client
//     .publicApi()
//     .getNodeStatus()
//     .then((status) => status.config.genesis_timestamp);
