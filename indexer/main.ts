import { ClientDuplexStream, ClientOptions, credentials } from "@grpc/grpc-js";
import { MassaServiceClient } from "./build/nodejs/api_grpc_pb";
import {
  GetVersionRequest,
  GetVersionResponse,
  NewFilledBlocksResponse,
  NewOperationsResponse,
  // NewSlotExecutionOutputsResponse,
} from "./build/nodejs/api_pb";
import { EOperationStatus } from "@massalabs/massa-web3";
import { analyticsTask, autonomousEvents } from "./src/crons";
import { indexedMethods, processEvents } from "./src/socket";
import { web3Client } from "./common/client";
import logger from "./common/logger";

const grpcDefaultHost = "37.187.156.118";
const grpcPort = 33037;
const grpcOptions: Partial<ClientOptions> = {
  // "grpc.keepalive_time_ms": 120000,
  // "grpc.keepalive_timeout_ms": 20000,
  // "grpc.keepalive_permit_without_calls": 10,
  // "grpc.max_connection_idle_ms": 100000,
  // "grpc.max_connection_age_ms": 120000,
  // "grpc.http2.min_time_between_pings_ms": 120000,
  // "grpc.http2.min_ping_interval_without_data_ms": 120000,
  // "grpc.enable_retries": 1,
  // "grpc.max_reconnect_backoff_ms": 1000, // https://stackoverflow.com/questions/42256810/how-can-i-change-grpcs-reconnection-behaviour-in-the-node-js-implementation
};

// const subscribeNewOperations = async () => {
//   const stream = service.newOperations();
//   stream.on("data", (data: NewOperationsResponse) => {
//     logger.info(data.toObject());
//   });
//   stream.on("error", (err) => {
//     logger.error(err);
//   });
//   stream.on("end", (e: any) => {
//     logger.warn("subscribeNewOperations end: " + e);
//   });
// };

// const subscribeNewSlotExecutionOutputs = async () => {
//   const stream = service.newSlotExecutionOutputs();
//   stream.on("data", (data: NewSlotExecutionOutputsResponse) => {
//     logger.info(data.toObject());
//   });
//   stream.on("error", (err) => {
//     logger.error(err);
//   });
//   stream.on("end", (e: any) => {
//     logger.warn("subscribeNewSlotExecutionOutputs end: " + e);
//   });
// };

const subscribeFilledBlocks = (host: string) => {
  const service = new MassaServiceClient(
    `${host}:${grpcPort}`,
    credentials.createInsecure(),
    grpcOptions
  );
  const stream = service.newFilledBlocks();
  logger.info(
    `[${host}:${grpcPort}] subscribeFilledBlocks start on ${new Date().toString()}`
  );

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
      } else if (op.executSc) {
      }
    });
  });
  stream.on("error", async (err) => {
    logger.error(err.message);
    logger.info(err);
    logger.info(err.name);
    if (err.message.includes("14")) {
      const newIp: string = await web3Client
        .publicApi()
        .getNodeStatus()
        .then((res) => {
          const nodes = res.connected_nodes;
          const nodeHashs = Object.keys(nodes);
          nodeHashs.forEach((nodeHash) => {
            const nodeInfo = nodes[nodeHash] as unknown as [string, boolean];
            const [ip, isReachable] = nodeInfo;
            logger.info({ nodeHash, ip, isReachable });
            if (isReachable) return ip;
          });
          return grpcDefaultHost;
        });
      // wait 1 minute if server is unavailable
      setTimeout(() => subscribeFilledBlocks(newIp), 1000 * 60);
    } else setTimeout(() => subscribeFilledBlocks(grpcDefaultHost), 1000 * 3);
  });
  stream.on("end", () => {
    logger.warn(`subscribeFilledBlocks end on ${new Date().toString()}`);
  });
  stream.on("status", (e: any) => {
    logger.warn(e);
  });
};

// const subscribe = async <Req, Res extends { toObject: () => any }>(
//   stream: ClientDuplexStream<Req, Res>
// ) => {
//   return new Promise((resolve, reject) => {
//     stream.on("data", (data: Res) => {
//       logger.info(data.toObject());
//     });
//     stream.on("error", (err) => {
//       logger.error(err);
//       reject(err);
//     });
//     stream.on("end", (e: any) => {
//       logger.warn("subscribe end", e);
//       resolve(e);
//     });
//   });
// };

subscribeFilledBlocks(grpcDefaultHost);

// Start cron tasks

analyticsTask.start();
autonomousEvents.start();
