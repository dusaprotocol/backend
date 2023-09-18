import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { EOperationStatus, IEvent } from "@massalabs/massa-web3";
import { MassaServiceClient } from "./gen/ts/massa/api/v1/api.client";
import { processLiquidity, processSwap } from "./src/socket";
import { web3Client } from "../common/client";
import logger from "../common/logger";
import {
  NewOperationsQuery,
  NewOperationsRequest,
  NewSlotExecutionOutputsRequest,
  OpType,
} from "./gen/ts/massa/api/v1/api";
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

const subscribeNewSlotExecutionOutputs = async (
  host: string = grpcDefaultHost
) => {
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
        status: [ExecutionOutputStatus.FINAL],
      },
    },
  };
  stream.requests.send(req);

  logger.info(
    `[${baseUrl}] subscribeNewSlotExecutionOutputs start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      console.log(message.output?.executionOutput?.slot);
      const events = message.output?.executionOutput?.events;
      if (!events) return;

      console.log("--------------------");
      events.forEach((event) => {
        if (!event.context) return;

        console.log(event.context.callStack, event.data);
        if (event.context.callStack.includes(dcaSC)) {
          const swapEvents = events.filter((e) => e.data.startsWith("SWAP:"));
          console.log(event.data);
          // processSwap(event.context.originOperationId, event.context.indexInSlot, )
        }
      });
      console.log("--------------------");
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(
      () => subscribeNewSlotExecutionOutputs(grpcDefaultHost),
      ONE_MINUTE
    );
  }
};

const subscribeNewOperations = async (host: string = grpcDefaultHost) => {
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

  logger.info(
    `[${baseUrl}] subscribeNewOperations start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      const txId = message.operation?.id;
      const caller = message.operation?.contentCreatorAddress;
      const content = message.operation?.content;
      if (!txId || !caller || !content) return;
      processOperation(content, caller, txId);
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(() => subscribeNewOperations(grpcDefaultHost), ONE_MINUTE);
  }
};

// Start gRPC subscriptions

// subscribeNewSlotExecutionOutputs();
subscribeNewOperations();

// HELPERS

async function processOperation(
  operation: Operation,
  caller: string,
  txId: string
) {
  const opType = operation.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const { targetAddr, targetFunc, param } = opType.callSc;
  if (targetAddr === dcaSC) {
    if (targetFunc === "dca") {
    } else if (targetFunc === "stopDca") {
    } else if (targetFunc === "updateDCA") {
    } else return;
  }

  if (targetAddr !== routerSC) return;

  try {
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

async function processDCA(user: string) {
  // prisma.dCA.update({ where: { userAddress: user }, data: {} });
}

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
