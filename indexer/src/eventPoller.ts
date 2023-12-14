import {
  EventPoller,
  Client,
  IEventFilter,
  ON_MASSA_EVENT_DATA,
  ON_MASSA_EVENT_ERROR,
  IEvent,
} from "@massalabs/massa-web3";
import { web3Client } from "../../common/client";
import { nullFilters } from "../../common/utils";

interface IEventPollerResult {
  isError: boolean;
  eventPoller: EventPoller;
  events: IEvent[];
}

const MASSA_EXEC_ERROR = "massa_execution_error";

export const pollAsyncEvents = async (
  opId: string
): Promise<IEventPollerResult> => {
  const eventsFilter: IEventFilter = {
    ...nullFilters,
    original_operation_id: opId,
  };

  const eventPoller = EventPoller.startEventsPolling(
    eventsFilter,
    1000,
    web3Client
  );

  return new Promise((resolve, reject) => {
    eventPoller.on(ON_MASSA_EVENT_DATA, (events: Array<IEvent>) => {
      const errorEvents: IEvent[] = events.filter((e) =>
        e.data.includes(MASSA_EXEC_ERROR)
      );
      if (errorEvents.length > 0) {
        return resolve({
          isError: true,
          eventPoller,
          events: errorEvents,
        });
      }

      if (events.length > 0) {
        return resolve({
          isError: false,
          eventPoller,
          events,
        });
      } else {
        console.log("No events emitted");
      }
    });
    eventPoller.on(ON_MASSA_EVENT_ERROR, (error: Error) => {
      console.log("Event Data Error:", error);
      return reject(error);
    });
  });
};
