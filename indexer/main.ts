import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { EOperationStatus } from "@massalabs/massa-web3";
import { MassaServiceClient } from "./gen/ts/massa/api/v1/api.client";
import { analyticsTask, autonomousEvents } from "./src/crons";
import { processLiquidity, processSwap } from "./src/socket";
import { web3Client } from "../common/client";
import logger from "../common/logger";
import { NewOperationsRequest, OpType } from "./gen/ts/massa/api/v1/api";
import { routerSC } from "../common/contracts";
import { decodeLiquidityTx, decodeSwapTx } from "./src/decoder";
import { Operation } from "./gen/ts/massa/model/v1/operation";
import { fetchEvents, getGenesisTimestamp, parseSlot } from "../common/utils";
import { fetchPairAddress } from "../common/methods";
import { SWAP_ROUTER_METHODS, LIQUIDITY_ROUTER_METHODS } from "@dusalabs/sdk";

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

try {
  // subscribeNewSlotExecutionOutputs(grpcDefaultHost);
  subscribeFilledBlocks(grpcDefaultHost);
} catch (err: any) {
  logger.error(err.message);
  logger.error(err);
}

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

  const opType = operation.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const targetAddress = opType.callSc.targetAddr;
  const method = opType.callSc.targetFunc;
  if (targetAddress !== routerSC || !method) return;

  const status = await web3Client
    .smartContracts()
    .awaitRequiredOperationStatus(txId, EOperationStatus.SPECULATIVE_SUCCESS)
    .catch((err) => {
      logger.error(err);
      return EOperationStatus.NOT_FOUND;
    });
  if (status !== EOperationStatus.SPECULATIVE_SUCCESS) {
    logger.debug(txId + " failed to reached final status");
    return;
  }
  logger.debug(txId + " has reached final status");
  const events = await fetchEvents({
    original_operation_id: txId,
  });
  if (
    !events.length ||
    events[events.length - 1].data.includes("massa_execution_error")
  )
    return;

  const genesisTimestamp = await getGenesisTimestamp();
  const timestamp = new Date(
    parseSlot(events[0].context.slot, genesisTimestamp)
  );
  const args = opType.callSc.param;

  if (SWAP_ROUTER_METHODS.includes(method as any)) {
    const swapParams = await decodeSwapTx(method, args);
    if (!swapParams) return;

    for (let i = 0; i < swapParams.path.length - 1; i++) {
      const tokenIn = swapParams.path[i].str;
      const tokenOut = swapParams.path[i + 1].str;
      const binStep = Number(swapParams.binSteps[i]);
      const pairAddress = await fetchPairAddress(tokenIn, tokenOut, binStep);
      if (!pairAddress) return;

      processSwap(
        txId,
        caller,
        timestamp,
        pairAddress,
        tokenIn,
        tokenOut,
        binStep,
        events.filter((e) => e.data.startsWith("SWAP:")),
        swapParams
      );
    }
  } else if (LIQUIDITY_ROUTER_METHODS.includes(method as any)) {
    const isAdd = method.startsWith("add");
    const liquidityParams = await decodeLiquidityTx(isAdd, args);
    if (!liquidityParams) return;

    const { token0, token1, binStep } = liquidityParams;
    const pairAddress = await fetchPairAddress(token0, token1, binStep);
    if (!pairAddress) return;

    processLiquidity(
      txId,
      caller,
      timestamp,
      pairAddress,
      token0,
      token1,
      // binStep,
      events.filter(
        (e) =>
          e.data.startsWith("DEPOSITED_TO_BIN:") ||
          e.data.startsWith("WITHDRAWN_FROM_BIN:")
      ),
      isAdd
    );
  }
}
