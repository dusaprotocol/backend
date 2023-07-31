import { ClientDuplexStream, ClientOptions, credentials } from "@grpc/grpc-js";
import { MassaServiceClient } from "./build/nodejs/api_grpc_pb";
import {
  NewFilledBlocksResponse,
  NewOperationsFilter,
  NewOperationsQuery,
  NewOperationsRequest,
  NewOperationsResponse,
  OpType,
} from "./build/nodejs/api_pb";
import { EOperationStatus } from "@massalabs/massa-web3";
import { analyticsTask, autonomousEvents } from "./src/crons";
import { indexedMethods, processEvents } from "./src/socket";
import { web3Client } from "./common/client";
import logger from "./common/logger";

const grpcDefaultHost = "37.187.156.118";
const grpcPort = 33037;

const subscribeNewOperations = (host: string) => {
  const service = new MassaServiceClient(
    `${host}:${grpcPort}`,
    credentials.createInsecure()
  );
  const stream = service.newOperations();

  const query = new NewOperationsQuery();
  const filter = new NewOperationsFilter();
  filter.addTypes(OpType.OP_TYPE_CALL_SC);
  query.setFilter(filter);
  stream.write(new NewOperationsRequest().setQuery(query));

  logger.info(
    `[${host}:${grpcPort}] subscribeNewOperations start on ${new Date().toString()}`
  );

  stream.on("data", (data: NewOperationsResponse) => {
    const op = data.getOperation()?.toObject();
    logger.info(op);
  });
  stream.on("error", async (err) => {
    logger.error(err.message);
    logger.info(err);
    logger.info(err.name);
    // if (err.message.includes("14")) {
    //   const newIp: string = await web3Client
    //     .publicApi()
    //     .getNodeStatus()
    //     .then((res) => {
    //       const nodes = res.connected_nodes;
    //       const nodeHashs = Object.keys(nodes);
    //       nodeHashs.forEach((nodeHash) => {
    //         const nodeInfo = nodes[nodeHash] as unknown as [string, boolean];
    //         const [ip, isReachable] = nodeInfo;
    //         logger.info({ nodeHash, ip, isReachable });
    //         if (isReachable) return ip;
    //       });
    //       return grpcDefaultHost;
    //     });
    //   // wait 1 minute if server is unavailable
    //   setTimeout(() => subscribeFilledBlocks(newIp), 1000 * 60);
    // } else setTimeout(() => subscribeFilledBlocks(grpcDefaultHost), 1000 * 3);
  });
  stream.on("end", () => {
    logger.warn(`subscribeNewOperations end on ${new Date().toString()}`);
  });
  stream.on("status", (e: any) => {
    logger.warn(e);
  });
};

// const subscribeNewSlotExecutionOutputs = async (host: string) => {
//   const service = new MassaServiceClient(
//     `${host}:${grpcPort}`,
//     credentials.createInsecure()
//   );
//   const stream = service.newSlotExecutionOutputs();
//   logger.info(
//     `[${host}:${grpcPort}] subscribeNewSlotExecutionOutputs start on ${new Date().toString()}`
//   );
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
    credentials.createInsecure()
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
        })
        .catch((err) => {
          logger.error(err);
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

// subscribeNewOperations(grpcDefaultHost);
subscribeFilledBlocks(grpcDefaultHost);

// Start cron tasks

analyticsTask.start();
autonomousEvents.start();
