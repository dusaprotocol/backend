import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { EOperationStatus } from "@massalabs/massa-web3";
import { MassaServiceClient } from "./gen/ts/massa/api/v1/api.client";
import { analyticsTask, autonomousEvents } from "./src/crons";
import { indexedMethods, processEvents } from "./src/socket";
import { web3Client } from "./common/client";
import logger from "./common/logger";
import { NewOperationsRequest, OpType } from "./gen/ts/massa/api/v1/api";
import { routerSC } from "./common/contracts";
import { decodeSwapTx } from "./src/decoder";

const grpcDefaultHost = "37.187.156.118";
const grpcPort = 33037;

const subscribeNewOperations = async (host: string) => {
  const baseUrl = `${host}:${grpcPort}`;
  const transport = new GrpcTransport({
    host: baseUrl,
    channelCredentials: ChannelCredentials.createInsecure(),
  });
  const service = new MassaServiceClient(transport);
  const stream = service.newOperations();

  const req: NewOperationsRequest = {
    id: "1",
    query: {
      filter: {
        types: [OpType.CALL_SC],
      },
    },
  };
  stream.requests.send(req);
  for await (let message of stream.responses) {
    const opType = message.operation?.content?.op?.type.oneofKind;
    if (opType !== "callSc") return;

    const targetAddress =
      message.operation?.content?.op?.type.callSc.targetAddr;
    const targetFunc = message.operation?.content?.op?.type.callSc.targetFunc;
    const caller = message.operation?.contentCreatorAddress;
    if (targetAddress !== routerSC || !targetFunc) return;

    console.log({ targetAddress, targetFunc, caller });
    const params = message.operation?.content?.op?.type.callSc.param;
    decodeSwapTx(targetFunc, params);
  }

  logger.info(
    `[${host}:${grpcPort}] subscribeNewOperations start on ${new Date().toString()}`
  );

  // stream.on("data", (data: NewOperationsResponse) => {
  //   const op = data.getOperation()?.toObject();
  //   logger.info(op);
  // });
  // stream.on("error", async (err) => {
  //   logger.error(err.message);
  //   logger.info(err);
  //   logger.info(err.name);
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
  // });
  // stream.on("end", () => {
  //   logger.warn(`subscribeNewOperations end on ${new Date().toString()}`);
  // });
  // stream.on("status", (e: any) => {
  //   logger.warn(e);
  // });
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

const subscribeFilledBlocks = async (host: string) => {
  const baseUrl = `${host}:${grpcPort}`;
  const transport = new GrpcTransport({
    host: baseUrl,
    channelCredentials: ChannelCredentials.createInsecure(),
  });
  const service = new MassaServiceClient(transport);
  const stream = service.newFilledBlocks();
  logger.info(
    `[${host}:${grpcPort}] subscribeFilledBlocks start on ${new Date().toString()}`
  );

  for await (let message of stream.responses) {
    console.log(message.filledBlock);
  }
  // stream.on("data", (data: NewFilledBlocksResponse) => {
  //   const block = data.getFilledBlock()?.toObject();
  //   const operations = block?.operationsList;

  //   operations?.forEach(async (operation) => {
  //     const op = operation?.operation?.content?.op;
  //     const txId = operation?.operation?.id;
  //     const creatorAddress = operation.operation
  //       ?.contentCreatorAddress as string;

  //     if (!op || !txId) return;

  //     if (op.callSc) {
  //       const method = op.callSc.targetFunc;
  //       if (!indexedMethods.includes(method)) return;

  //       const status = await web3Client
  //         .smartContracts()
  //         .awaitRequiredOperationStatus(
  //           txId,
  //           EOperationStatus.SPECULATIVE_SUCCESS
  //         );
  //       if (status !== EOperationStatus.SPECULATIVE_SUCCESS) {
  //         logger.debug(txId + " failed to reached final status");
  //         return;
  //       }
  //       logger.debug(txId + " has reached final status");

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
  //         .then((events) =>
  //           processEvents(txId, creatorAddress, method, events)
  //         );
  //     } else if (op.executSc) {
  //     }
  //   });
  // });
  // stream.on("error", async (err) => {
  //   logger.error(err.message);
  //   logger.info(err);
  //   logger.info(err.name);
  //   if (err.message.includes("14")) {
  //     const newIp: string = await web3Client
  //       .publicApi()
  //       .getNodeStatus()
  //       .then((res) => {
  //         const nodes = res.connected_nodes;
  //         const nodeHashs = Object.keys(nodes);
  //         nodeHashs.forEach((nodeHash) => {
  //           const nodeInfo = nodes[nodeHash] as unknown as [string, boolean];
  //           const [ip, isReachable] = nodeInfo;
  //           logger.info({ nodeHash, ip, isReachable });
  //           if (isReachable) return ip;
  //         });
  //         return grpcDefaultHost;
  //       })
  //       .catch((err) => {
  //         logger.error(err);
  //         return grpcDefaultHost;
  //       });
  //     // wait 1 minute if server is unavailable
  //     setTimeout(() => subscribeFilledBlocks(newIp), 1000 * 60);
  //   } else setTimeout(() => subscribeFilledBlocks(grpcDefaultHost), 1000 * 3);
  // });
  // stream.on("end", () => {
  //   logger.warn(`subscribeFilledBlocks end on ${new Date().toString()}`);
  // });
  // stream.on("status", (e: any) => {
  //   logger.warn(e);
  // });
};

subscribeNewOperations(grpcDefaultHost);
// subscribeFilledBlocks(grpcDefaultHost);

// Start cron tasks

// analyticsTask.start();
// autonomousEvents.start();
