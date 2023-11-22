import {
  EventPoller,
  IEvent,
  IEventFilter,
  ISlot,
} from "@massalabs/massa-web3";
import { web3Client } from "../client";

const nullFilters: IEventFilter = {
  start: null,
  end: null,
  emitter_address: null,
  original_caller_address: null,
  original_operation_id: null,
  is_final: null,
};

export const fetchEvents = async (
  filter: Partial<IEventFilter>
): Promise<IEvent[]> => {
  return web3Client
    .smartContracts()
    .getFilteredScOutputEvents({
      ...nullFilters,
      ...filter,
    })
    .then((events) => {
      if (!events.length) {
        throw new Error("No events found");
      }
      if (events[events.length - 1].data.includes("massa_execution_error")) {
        throw new Error("Tx went wrong");
      }
      return events;
    });
};

const watchEvent = async (
  txHash: string,
  eventName: string
): Promise<string[]> => {
  const eventsNameRegex = `^${eventName}:`;
  const eventArguments: string[] = await EventPoller.getEventsOnce(
    { ...nullFilters, original_operation_id: txHash, eventsNameRegex },
    web3Client
  ).then((events) => events[0].data.split(eventName + ":")[1].split(","));

  return eventArguments;
};

// USAGE:

const TRANSFER_EVENT_NAME = "TRANSFER";
type TransferEvent = {
  from: string;
  to: string;
  amount: bigint;
};

// const event = await watchEvent<TransferEvent>("TRANSFER");
// if (!event) {
//   throw new Error("No event found");
// }
// console.log(event);
// {from: "0x...", to: "0x...", amount: 1000000000000000000n}

const watchTransferEvent = async (txId: string): Promise<TransferEvent> => {
  const params = await watchEvent(txId, TRANSFER_EVENT_NAME);
  return {
    from: params[0],
    to: params[1],
    amount: BigInt(params[2]),
  };
};
