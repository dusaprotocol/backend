import { IEvent, IEventFilter, ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../client";

export const fetchEvents = async (
  filter: Partial<IEventFilter>
): Promise<IEvent[]> => {
  return web3Client
    .smartContracts()
    .getFilteredScOutputEvents({
      start: filter.start || null,
      end: filter.end || null,
      emitter_address: filter.emitter_address || null,
      original_caller_address: filter.original_caller_address || null,
      original_operation_id: filter.original_operation_id || null,
      is_final: filter.is_final || null,
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
