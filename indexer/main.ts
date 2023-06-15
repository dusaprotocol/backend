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
import { priceTask, analyticsTask, autonomousEvents } from "./src/crons";
import { indexedMethods, processEvents } from "./src/socket";
import { web3Client } from "./common/client";
import logger from "./common/logger";

const port = process.env.PORT || 33037;
const host = process.env.HOST || "37.187.156.118";
const url = `${host}:${port}`.replace(" ", "");
logger.info(`Connecting to ${url}`);
const service = new MassaServiceClient(
  url,
  credentials.createInsecure() /* {
  "grpc.keepalive_time_ms": 120000,
  "grpc.keepalive_timeout_ms": 20000,
} */
);

const subscribeNewOperations = async () => {
  const stream = service.newOperations();
  stream.on("data", (data: NewOperationsResponse) => {
    logger.info(data.toObject());
  });
  stream.on("error", (err) => {
    logger.error(err);
  });
  stream.on("end", (e: any) => {
    logger.warn("subscribeNewOperations end: " + e);
  });
};

const subscribeTransactionsThroughput = async () => {
  const stream = service.transactionsThroughput();
  stream.on("data", (data: TransactionsThroughputResponse) => {
    logger.info(data.toObject());
  });
  stream.on("error", (err) => {
    logger.error(err);
  });
  stream.on("end", (e: any) => {
    logger.warn("subscribeTransactionsThroughput end: " + e);
  });
};

const subscribeNewSlotExecutionOutputs = async () => {
  const stream = service.newSlotExecutionOutputs();
  stream.on("data", (data: NewSlotExecutionOutputsResponse) => {
    logger.info(data.toObject());
  });
  stream.on("error", (err) => {
    logger.error(err);
  });
  stream.on("end", (e: any) => {
    logger.warn("subscribeNewSlotExecutionOutputs end: " + e);
  });
};

const subscribeFilledBlocks = async () => {
  const stream = service.newFilledBlocks();
  stream.on("data", (data: NewFilledBlocksResponse) => {
    const block = data.getFilledBlock()?.toObject();
    const operations = block?.operationsList;

    operations?.forEach(async (operation) => {
      const op = operation?.operation?.content?.op;
      const txId = operation?.operation?.id;
      if (!op || !txId) return;

      if (op.callSc) {
        const method = op.callSc.targetFunc;
        if (!indexedMethods.includes(method)) return;

        const status = await web3Client
          .smartContracts()
          .awaitRequiredOperationStatus(txId, EOperationStatus.FINAL);
        if (status !== EOperationStatus.FINAL) {
          logger.debug(txId + " failed to reached final status");
          return;
        }
        logger.debug(txId + " has reached final status");

        web3Client
          .smartContracts()
          .getFilteredScOutputEvents({
            start: null,
            end: null,
            emitter_address: null,
            original_caller_address: null,
            is_final: null,
            original_operation_id: txId,
          })
          .then((events) => processEvents(txId, method, events));
      }
    });
  });
  stream.on("error", (err) => {
    logger.error(err);
  });
  stream.on("end", (e: any) => {
    logger.warn("subscribeFilledBlocks end");
    logger.warn(e);
  });
  stream.on("close", (e: any) => {
    logger.warn("subscribeFilledBlocks close");
    logger.warn(e);
  });
  stream.on("finish", (e: any) => {
    logger.warn("subscribeFilledBlocks finish");
    logger.warn(e);
  });
  stream.on("status", (e: any) => {
    logger.warn("subscribeFilledBlocks status");
    logger.warn(e);
  });
  stream.on("metadata", (e: any) => {
    logger.warn("subscribeFilledBlocks metadata");
    logger.warn(e);
  });
};

const subscribe = async <Req, Res extends { toObject: () => any }>(
  stream: ClientDuplexStream<Req, Res>
) => {
  return new Promise((resolve, reject) => {
    stream.on("data", (data: Res) => {
      logger.info(data.toObject());
    });
    stream.on("error", (err) => {
      logger.error(err);
      reject(err);
    });
    stream.on("end", (e: any) => {
      logger.warn("subscribe end", e);
      resolve(e);
    });
  });
};

subscribeFilledBlocks();

// Start cron tasks

priceTask.start();
analyticsTask.start();
autonomousEvents.start();
