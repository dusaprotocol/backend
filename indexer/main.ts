import { analyticsCron } from "./src/crons";
import {
  subscribeNewSlotExecutionOutputs,
  subscribeNewOperations,
} from "./src/grpc";

// Start gRPC subscriptions

// subscribeNewSlotExecutionOutputs();
subscribeNewOperations();

// Start cron jobs

analyticsCron.start();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
