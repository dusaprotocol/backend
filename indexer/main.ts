import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { EOperationStatus, IEvent } from "@massalabs/massa-web3";
import { MassaServiceClient } from "./gen/ts/massa/api/v1/api.client";
import { analyticsTask, autonomousEvents } from "./src/crons";
import { processLiquidity, processSwap } from "./src/socket";
import { web3Client } from "../common/client";
import logger from "../common/logger";
import { NewSlotExecutionOutputsRequest } from "./gen/ts/massa/api/v1/api";
import { dcaSC, routerSC } from "../common/contracts";
import { decodeLiquidityTx, decodeSwapTx } from "./src/decoder";
import { Operation } from "./gen/ts/massa/model/v1/operation";
import {
  ONE_MINUTE,
  fetchEvents,
  getGenesisTimestamp,
  parseSlot,
} from "../common/utils";
import { fetchPairAddress, getCallee } from "../common/methods";
import { SWAP_ROUTER_METHODS, LIQUIDITY_ROUTER_METHODS } from "@dusalabs/sdk";
import { ExecutionOutputStatus } from "./gen/ts/massa/model/v1/execution";

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
  const req: NewSlotExecutionOutputsRequest = {
    id: "1",
    query: {
      filter: {
        status: [
          // ExecutionOutputStatus.CANDIDATE,
          ExecutionOutputStatus.FINAL,
          // ExecutionOutputStatus.UNSPECIFIED,
        ],
      },
    },
  };
  stream.requests.send(req);

  logger.info(
    `[${baseUrl}] subscribeNewSlotExecutionOutputs start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      message.output?.executionOutput?.events.forEach((event) => {
        if (event.context?.callStack.includes(dcaSC)) console.log(event.data);
      });
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(
      () => subscribeNewSlotExecutionOutputs(grpcDefaultHost),
      ONE_MINUTE
    );
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
    `[${baseUrl}] subscribeFilledBlocks start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      message.filledBlock?.operations.forEach((op) => {
        const txId = op.operationId;
        const caller = op.operation?.contentCreatorAddress;
        processOperation(op.operation?.content, caller, txId);
      });
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(() => subscribeFilledBlocks(grpcDefaultHost), ONE_MINUTE);
  }

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
};

// Start gRPC subscriptions

try {
  // subscribeNewSlotExecutionOutputs(grpcDefaultHost);
  subscribeFilledBlocks(grpcDefaultHost);
} catch (err: any) {
  logger.error(err.message);
  logger.info("error when subscribing to gRPC");
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
  if (!operation || !caller) {
    return;
  }

  const opType = operation.op?.type;
  if (opType?.oneofKind !== "callSc" || opType.callSc.targetAddr !== routerSC) {
    return;
  }

  try {
    const { targetFunc, param } = opType.callSc;
    const status = await awaitOperationStatus(txId);
    const events = await fetchEvents({ original_operation_id: txId });
    const timestamp = await getTimestamp(events);

    if (SWAP_ROUTER_METHODS.includes(targetFunc as any)) {
      await processSwapOperation(
        param,
        targetFunc,
        txId,
        caller,
        timestamp,
        events
      );
    } else if (LIQUIDITY_ROUTER_METHODS.includes(targetFunc as any)) {
      await processLiquidityOperation(
        param,
        targetFunc,
        txId,
        caller,
        timestamp,
        events
      );
    } else {
      throw new Error("Unknown router method:" + targetFunc);
    }
  } catch (err: any) {
    logger.error(err.message);
  }
}

async function awaitOperationStatus(txId: string) {
  return web3Client
    .smartContracts()
    .awaitRequiredOperationStatus(txId, EOperationStatus.FINAL_SUCCESS)
    .then((status) => {
      if (status !== EOperationStatus.FINAL_SUCCESS) {
        throw new Error("Operation status is not FINAL_SUCCESS");
      }
      return status;
    });
}

async function getTimestamp(events: IEvent[]) {
  const genesisTimestamp = await getGenesisTimestamp();
  return new Date(parseSlot(events[0].context.slot, genesisTimestamp));
}

async function processSwapOperation(
  args: Uint8Array,
  method: string,
  txId: string,
  caller: string,
  timestamp: Date,
  events: IEvent[]
) {
  const swapParams = await decodeSwapTx(method, args);
  if (swapParams) {
    for (let i = 0; i < swapParams.path.length - 1; i++) {
      const tokenIn = swapParams.path[i].str;
      const tokenOut = swapParams.path[i + 1].str;
      const binStep = Number(swapParams.binSteps[i]);
      const pairAddress = await fetchPairAddress(tokenIn, tokenOut, binStep);
      if (!pairAddress) return;

      processSwap(
        txId,
        i,
        caller,
        timestamp,
        pairAddress,
        tokenIn,
        tokenOut,
        binStep,
        events.filter(
          (e) => getCallee(e) === pairAddress && e.data.startsWith("SWAP:")
        ),
        swapParams
      );
    }
  }
}

async function processLiquidityOperation(
  args: Uint8Array,
  method: string,
  txId: string,
  caller: string,
  timestamp: Date,
  events: IEvent[]
) {
  const isAdd = method.startsWith("add");
  const liquidityParams = await decodeLiquidityTx(isAdd, args);
  if (liquidityParams) {
    const { token0, token1, binStep } = liquidityParams;
    const pairAddress = await fetchPairAddress(token0, token1, binStep);
    if (pairAddress) {
      processLiquidity(
        txId,
        caller,
        timestamp,
        pairAddress,
        token0,
        token1,
        events.filter(
          (e) =>
            e.data.startsWith("DEPOSITED_TO_BIN:") ||
            e.data.startsWith("WITHDRAWN_FROM_BIN:")
        ),
        isAdd
      );
    }
  }
}

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
