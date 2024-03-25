import * as gRPC from "./src/grpc";

gRPC.subscribeNewSlotExecutionOutputs();
// gRPC.subscribeNewOperations();
gRPC.subscribeNewFilledBlocks();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): string {
  return this.toString();
};
