import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { EOperationStatus } from "@massalabs/massa-web3";
import { MassaServiceClient } from "./gen/ts/massa/api/v1/api.client";
import { analyticsTask, autonomousEvents } from "./src/crons";
import { indexedMethods, processEvents } from "./src/socket";
import { web3Client } from "../common/client";
import logger from "../common/logger";
import { NewOperationsRequest, OpType } from "./gen/ts/massa/api/v1/api";
import { routerSC } from "../common/contracts";
import { decodeSwapTx } from "./src/decoder";
import { Operation } from "./gen/ts/massa/model/v1/operation";

const grpcDefaultHost = "37.187.156.118";
const grpcPort = 33037;

const subscribeNewSlotExecutionOutputs = async (host: string) => {
  const baseUrl = `${host}:${grpcPort}`;
  const transport = new GrpcTransport({
    host: baseUrl,
    channelCredentials: ChannelCredentials.createInsecure(),
  });
  const service = new MassaServiceClient(transport);
  const stream = service.newSlotExecutionOutputs();
  logger.info(
    `[${host}:${grpcPort}] subscribeNewSlotExecutionOutputs start on ${new Date().toString()}`
  );

  for await (let message of stream.responses) {
    console.log(message.output);
  }
};

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
    // console.log(message.filledBlock?.header?.id);
    message.filledBlock?.operations.forEach((op) => {
      const txId = op.operationId;
      const caller = op.operation?.contentCreatorAddress;
      processOperation(op.operation?.content, caller, txId);
    });
  }

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

// Start gRPC subscriptions

// subscribeNewSlotExecutionOutputs(grpcDefaultHost);
subscribeFilledBlocks(grpcDefaultHost);

// Start cron tasks

analyticsTask.start();
autonomousEvents.start();

// HELPERS

async function processOperation(
  operation: Operation | undefined,
  caller: string | undefined,
  txId: string
) {
  if (!operation || !caller) return;

  const opType = operation?.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const targetAddress = opType.callSc.targetAddr;
  const targetFunc = opType.callSc.targetFunc;
  if (targetAddress !== routerSC || !targetFunc) return;

  console.log({ targetAddress, targetFunc, caller });
  const params = opType.callSc.param;
  decodeSwapTx(targetFunc, params);

  const status = await web3Client
    .smartContracts()
    .awaitRequiredOperationStatus(txId, EOperationStatus.SPECULATIVE_SUCCESS);
  if (status !== EOperationStatus.SPECULATIVE_SUCCESS) {
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
    .then((events) => processEvents(txId, caller, targetFunc, events));
}
