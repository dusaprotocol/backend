import {
  EventPoller,
  IEvent,
  IEventFilter,
  ISlot,
} from "@massalabs/massa-web3";
import { web3Client } from "../client";
import { EventDecoder, SwapEvent } from "@dusalabs/sdk";

export const nullFilters: IEventFilter = {
  start: null,
  end: null,
  emitter_address: null,
  original_caller_address: null,
  original_operation_id: null,
  is_final: null,
};

const watchEvent = async (
  txHash: string,
  eventName: string
): Promise<string> => {
  const eventsNameRegex = `^${eventName}:`;
  return EventPoller.getEventsOnce(
    { ...nullFilters, original_operation_id: txHash, eventsNameRegex },
    web3Client
  ).then((events) => events[0].data);
};

// USAGE:

const SWAP_EVENT_NAME = "SWAP";
const watchSwapEvent = async (txHash: string): Promise<SwapEvent> => {
  const params = await watchEvent(txHash, SWAP_EVENT_NAME);
  return EventDecoder.decodeSwap(params);
};
