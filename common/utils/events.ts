import { IEvent, IEventFilter, ISlot } from "@massalabs/massa-web3";
import { web3Client } from "../client";

export const fetchEvents = (filter: Partial<IEventFilter>): Promise<IEvent[]> =>
  web3Client.smartContracts().getFilteredScOutputEvents({
    start: filter.start || null,
    end: filter.end || null,
    emitter_address: filter.emitter_address || null,
    original_caller_address: filter.original_caller_address || null,
    original_operation_id: filter.original_operation_id || null,
    is_final: filter.is_final || null,
  });
