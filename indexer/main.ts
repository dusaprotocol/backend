import { ClientDuplexStream, credentials } from "@grpc/grpc-js";
import { MassaServiceClient } from "./build/nodejs/api_grpc_pb";
import {
  GetVersionRequest,
  GetVersionResponse,
  NewFilledBlocksResponse,
  NewOperationsResponse,
  NewSlotExecutionOutputsResponse,
} from "./build/nodejs/api_pb";
import { TransactionsThroughputResponse } from "./build/nodejs/api_pb";
import { EOperationStatus } from "@massalabs/massa-web3";
import { ICallSmartContractOpType } from "@massalabs/massa-web3/dist/esm/interfaces/OperationTypes";
import { IFilledBlockInfo } from "@massalabs/massa-web3/dist/esm/interfaces/ISubscribedFullBlocksMessage";
import { web3Client } from "./src/client";
import {priceTask, analyticsTask, autonomousEvents} from "./src/crons";
import { processEvents } from "./src/socket";

const port = process.env.PORT || 33037;
const host = process.env.HOST || "37.187.156.118";
const url = `${host}:${port}`.replace(" ", "");
console.log(url);
const service = new MassaServiceClient(url, credentials.createInsecure());

const subscribeNewOperations = async () => {
  const stream = service.newOperations();
  return new Promise((resolve, reject) => {
    stream.on("data", (data: NewOperationsResponse) => {
      console.log(data.toObject());
    });
    stream.on("error", (err) => {
      console.log(err);
      reject(err);
    });
    stream.on("end", (e: any) => {
      console.log("end");
      resolve(e);
    });
  });
};

const subscribeTransactionsThroughput = async () => {
  const stream = service.transactionsThroughput();
  return new Promise((resolve, reject) => {
    stream.on("data", (data: TransactionsThroughputResponse) => {
      console.log(data.toObject());
    });
    stream.on("error", (err) => {
      console.log(err);
      reject(err);
    });
    stream.on("end", (e: any) => {
      console.log("end");
      resolve(e);
    });
  });
};

const subscribeNewSlotExecutionOutputs = async () => {
  const stream = service.newSlotExecutionOutputs();
  return new Promise((resolve, reject) => {
    stream.on("data", (data: NewSlotExecutionOutputsResponse) => {
      console.log(data.toObject());
    });
    stream.on("error", (err) => {
      console.log(err);
      reject(err);
    });
    stream.on("end", (e: any) => {
      console.log("end");
      resolve(e);
    });
  });
};

const subscribeFilledBlocks = async () => {
  const stream = service.newFilledBlocks();
  return new Promise((resolve, reject) => {
    stream.on("data", (data: NewFilledBlocksResponse) => {
      const block = data.getFilledBlock()?.toObject();
      const operations = block?.operationsList;
      console.log(block?.header?.id, operations?.length);
      operations?.forEach((op) =>
        console.log({
          id: op.operationId,
          call: op.operation?.content?.op?.callSc,
        })
      );
    });
    stream.on("error", (err) => {
      console.log(err);
      reject(err);
    });
    stream.on("end", (e: any) => {
      console.log("end");
      resolve(e);
    });
  });
};

const subscribe = async <Req, Res extends { toObject: () => any }>(
  stream: ClientDuplexStream<Req, Res>
) => {
  return new Promise((resolve, reject) => {
    stream.on("data", (data: Res) => {
      console.log(data.toObject());
    });
    stream.on("error", (err) => {
      console.log(err);
      reject(err);
    });
    stream.on("end", (e: any) => {
      console.log("end");
      resolve(e);
    });
  });
};

const stream = service.newFilledBlocks();
stream.on("error", console.log);
stream.on("end", () => console.log("end"));
stream.on("data", (data: NewFilledBlocksResponse) => {
  const block = data.getFilledBlock()?.toObject();
  const operations = block?.operationsList;
  console.log(block?.header?.id, operations?.length);
  operations?.forEach((operation) => {
    // const txId = operation[0];
    // const op = (operation[1] as unknown as IFilledBlockInfo).content.op;
    // if ("CallSC" in op) {
    //   const method = (op as ICallSmartContractOpType).CallSC.target_func;
    //   web3Client
    //     .smartContracts()
    //     .awaitRequiredOperationStatus(txId, EOperationStatus.FINAL)
    //     .then((status) => {
    //       if (status !== EOperationStatus.FINAL) {
    //         console.log(txId + " failed to reached final status");
    //         return;
    //       }
    //       console.log(txId + " has reached final status");
    //       web3Client
    //         .smartContracts()
    //         .getFilteredScOutputEvents({
    //           start: null,
    //           end: null,
    //           emitter_address: null,
    //           original_caller_address: null,
    //           is_final: null,
    //           original_operation_id: txId,
    //         })
    //         .then((events) => processEvents(txId, method, events));
    //     });
    // }
  });
});

// Start cron tasks

priceTask.start();
analyticsTask.start();
autonomousEvents.start();
