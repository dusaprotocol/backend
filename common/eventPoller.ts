import {
  EventPoller,
  Client,
  IEventFilter,
  ON_MASSA_EVENT_DATA,
  ON_MASSA_EVENT_ERROR,
  IEvent,
} from "@massalabs/massa-web3";
import { web3Client } from "./client";
import logger from "./logger";

interface IEventPollerResult {
  isError: boolean;
  events: IEvent[];
}

const nullFilters: IEventFilter = {
  start: null,
  end: null,
  emitter_address: null,
  original_caller_address: null,
  original_operation_id: null,
  is_final: null,
};

const MASSA_EXEC_ERROR = "massa_execution_error";

export const createEventPoller = (opId: string): EventPoller => {
  const eventsFilter: IEventFilter = {
    ...nullFilters,
    original_operation_id: opId,
  };

  return EventPoller.startEventsPolling(eventsFilter, 1000, web3Client);
};

export const pollAsyncEvents = async (
  eventPoller: EventPoller
): Promise<IEventPollerResult> => {
  return new Promise((resolve, reject) => {
    eventPoller.on(ON_MASSA_EVENT_DATA, (events: Array<IEvent>) => {
      const errorEvents: IEvent[] = events.filter((e) =>
        e.data.includes(MASSA_EXEC_ERROR)
      );
      if (errorEvents.length > 0) {
        return resolve({
          isError: true,
          events: errorEvents,
        });
      }

      if (events.length > 0) {
        return resolve({
          isError: false,
          events,
        });
      } else {
        logger.info("No events emitted");
      }
    });
    eventPoller.on(ON_MASSA_EVENT_ERROR, (error: Error) => {
      logger.warn("Event Data Error:", error);
      return reject(error);
    });
  });
};
