import { IEvent, ISlot } from "@massalabs/massa-web3";
import { Slot } from "../gen/ts/massa/model/v1/slot";
import { genesisTimestamp, ONE_PERIOD } from "../../common/utils";
import { ScExecutionEvent } from "../gen/ts/massa/model/v1/execution";

/**
 * Returns the approximate timestamp of a slot, based on the network's genesis timestamp
 * @param slot
 * @returns
 */
export const parseSlot = (slot: Slot | ISlot): number =>
  genesisTimestamp +
  Number(slot.period) * ONE_PERIOD +
  (slot.thread / 2) * 1000;

/**
 * Returns the timestamp at which the event was emitted
 * @param event
 * @returns
 */
export const getEventTimestamp = (event: IEvent | ScExecutionEvent) => {
  if (!event.context) return new Date();

  const slot =
    "slot" in event.context ? event.context.slot : event.context.originSlot;
  if (!slot) return new Date();

  return new Date(parseSlot(slot));
};
