import {
  SWAP_ROUTER_METHODS,
  LIQUIDITY_ROUTER_METHODS,
  EventDecoder,
  SwapRouterMethod,
  LiquidityRouterMethod,
} from "@dusalabs/sdk";
import { bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { ADDRESSES, dcaSC, orderSC, routerSC } from "../../common/contracts";
import { handlePrismaError, prisma } from "../../common/db";
import { fetchEvents, fetchPairAddress } from "../../common/datastoreFetcher";
import { isLiquidityEvent, isSwapEvent } from "../../common/methods";
import { ONE_MINUTE, getTimestamp, wait } from "../../common/utils";
import {
  decodeDcaTx,
  decodeSwapTx,
  decodeLiquidityTx,
  decodeOrderTx,
} from "./decoder";
import {
  processSwap,
  processLiquidity,
  processInnerSwap,
  processDCAExecution,
  processOrderExecution,
} from "./socket";
import {
  NewFilledBlocksResponse,
  NewOperationsResponse,
  NewSlotExecutionOutputsResponse,
} from "../gen/ts/massa/api/v1/public";
import { createDCA, updateDCAStatus } from "./db";
import { Prisma, Status } from "@prisma/client";
import logger from "../../common/logger";
import { BytesMapFieldEntry } from "../gen/ts/massa/model/v1/commons";
import { SignedOperation } from "../gen/ts/massa/model/v1/operation";
import { StateChanges } from "../gen/ts/massa/model/v1/execution";

export async function handleNewFilledBlocks(message: NewFilledBlocksResponse) {
  if (!message.filledBlock) return;

  const { header, operations } = message.filledBlock;
  const blockId = header?.secureHash;
  if (!blockId || !operations.length) return;

  const slot = header?.content?.slot;
  if (!slot) return;

  const indexedOperations = operations.filter(
    ({ operation }) => operation && needIndexing(operation)
  );
  if (!indexedOperations.length) return;

  await prisma.block
    .create({
      data: {
        id: blockId,
        period: Number(slot.period),
        thread: slot.thread,
      },
    })
    .catch(handlePrismaError);

  indexedOperations.forEach(async (op, i) => {
    op.operation && processSignedOperation(op.operation, i, blockId);
  });
}

export async function handleNewSlotExecutionOutputs(
  message: NewSlotExecutionOutputsResponse
) {
  const output = message.output?.executionOutput;
  if (!output) return;
  const { events, slot, blockId: block, stateChanges } = output;
  const period = Number(slot?.period) || 0;
  const thread = Number(slot?.thread) || 0;
  const blockId = block?.value || "";
  if (!events || !stateChanges) return;

  processLedgerChanges(stateChanges, blockId);

  events.forEach(async (event, i) => {
    try {
      if (!event.context) return;

      const eventData = bytesToStr(event.data);
      const { callStack } = event.context;

      if (callStack.includes(dcaSC) || callStack.includes(orderSC)) {
        if (eventData.startsWith("SWAP:"))
          await processInnerSwap({ event, callStack, blockId, i });
      }

      if (callStack.includes(dcaSC)) {
        if (eventData.startsWith("DCA_EXECUTED:"))
          await processDCAExecution(eventData, { period, thread, blockId });
      } else if (callStack.includes(orderSC)) {
        if (eventData.startsWith("EXECUTE_LIMIT_ORDER:")) {
          await processOrderExecution(eventData, { period, thread, blockId });
        }
      } else return;
    } catch (err: any) {
      logger.warn(JSON.stringify(event));
      await prisma.log.create({
        data: {
          data: Buffer.from(JSON.stringify(event)),
          message: err.message,
        },
      });
    }
  });
}

export async function handleNewOperations(message: NewOperationsResponse) {
  if (!message.signedOperation) return;
  if (!needIndexing(message.signedOperation)) return;
  processSignedOperation(message.signedOperation);
}

const processSignedOperation = async (
  signedOperation: SignedOperation,
  indexInBlock: number = 0,
  blockId: string = ""
) => {
  const {
    secureHash: txHash,
    contentCreatorAddress: userAddress,
    content: operation,
  } = signedOperation;
  const opType = operation?.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const { targetAddress, targetFunction, parameter, coins, maxGas } =
    opType.callSc;
  const indexedSC = [dcaSC, orderSC, routerSC];
  if (!indexedSC.includes(targetAddress)) return;

  const { isError, events } = await fetchEvents(txHash);
  if (isError) return;

  await prisma.operation
    .create({
      data: {
        data: Buffer.from(parameter),
        targetAddress,
        targetFunction,
        callerAddress: userAddress,
        value: coins?.mantissa || 0,
        id: txHash,
        blockId,
        maxGas,
        events: {
          createMany: {
            data: events.map((event) => ({
              data: Buffer.from(strToBytes(event.data)),
              emitterAddress: event.context.call_stack[0],
              indexInSlot: event.context.index_in_slot,
            })),
          },
        },
      },
    })
    .catch(handlePrismaError);

  try {
    // PERIPHERY CONTRACTS

    if (targetAddress === dcaSC) {
      switch (targetFunction) {
        case "startDCA": {
          const event = events.find((e) => e.data.startsWith("DCA_ADDED:"));
          if (!event) return;

          const dca = decodeDcaTx(parameter);

          const id = EventDecoder.decodeDCA(event.data).id;
          if (!dca || !id) return;

          createDCA({ ...dca, userAddress, txHash, id, status: "ACTIVE" });
          break;
        }
        case "stopDCA": {
          const event = events.find((e) =>
            e.data.startsWith("DCA_CANCELLED:")
          )?.data;
          if (!event) return;

          const id = EventDecoder.decodeDCA(event).id;
          updateDCAStatus(id, Status.STOPPED);
          break;
        }
        case "updateDCA":
        default:
          break;
      }
    } else if (targetAddress === orderSC) {
      switch (targetFunction) {
        case "addLimitOrder": {
          const order = decodeOrderTx(parameter);

          const event = events.find((e) =>
            e.data.startsWith("NEW_LIMIT_ORDER:")
          )?.data;
          if (!event) return;

          const { id } = EventDecoder.decodeLimitOrder(event);
          if (!id) return;

          await prisma.order
            .create({
              data: {
                ...order,
                id,
                userAddress,
                txHash,
                status: "ACTIVE",
              },
            })
            .catch(handlePrismaError);
          break;
        }
        case "removeLimitOrder":
          const event = events.find((e) =>
            e.data.startsWith("REMOVE_LIMIT_ORDER:")
          )?.data;
          if (!event) return;

          const { id } = EventDecoder.decodeLimitOrder(event);
          if (!id) return;

          await prisma.order.update({
            where: {
              id,
            },
            data: {
              status: "STOPPED",
            },
          });
          break;
        default:
          break;
      }
    }

    // ROUTER CONTRACT
    else {
      const timestamp = getTimestamp(events[0]);

      if (isSwapMethod(targetFunction)) {
        const swapParams = decodeSwapTx(targetFunction, parameter, coins);
        for (let i = 0; i < swapParams.path.length - 1; i++) {
          const tokenInAddress = swapParams.path[i].str;
          const tokenOutAddress = swapParams.path[i + 1].str;
          const binStep = Number(swapParams.binSteps[i]);
          const poolAddress = await fetchPairAddress(
            tokenInAddress,
            tokenOutAddress,
            binStep
          );

          const swapEvents = events.filter((e) => isSwapEvent(e, poolAddress));
          if (!swapEvents.length) continue;

          await processSwap({
            txHash,
            indexInSlot: i,
            userAddress,
            timestamp,
            poolAddress,
            tokenInAddress,
            tokenOutAddress,
            binStep,
            swapEvents: swapEvents.map((e) => e.data),
            swapParams,
          });
        }
      } else if (isLiquidtyMethod(targetFunction)) {
        const isAdd = targetFunction.startsWith("add");
        const liquidityParams = decodeLiquidityTx(isAdd, parameter, coins);
        const { token0, token1, binStep } = liquidityParams;
        const poolAddress = await fetchPairAddress(token0, token1, binStep);

        const liqEvents = events.filter((e) =>
          isLiquidityEvent(e, poolAddress)
        );
        if (!liqEvents.length) return;

        await processLiquidity({
          txHash,
          userAddress,
          timestamp,
          poolAddress,
          token0Address: token0,
          token1Address: token1,
          liqEvents: liqEvents.map((e) => e.data),
          isAdd,
        });
      } else throw new Error("Unknown router method:" + targetFunction);
    }
  } catch (err: any) {
    logger.warn(JSON.stringify(events, null, 4));
    await prisma.log.create({
      data: {
        data: Buffer.from(JSON.stringify(events)),
        message: err.message,
      },
    });
  }
};

const isSwapMethod = (str: string): str is SwapRouterMethod =>
  !!SWAP_ROUTER_METHODS.find((method) => str === method);

const isLiquidtyMethod = (str: string): str is LiquidityRouterMethod =>
  !!LIQUIDITY_ROUTER_METHODS.find((method) => str === method);

const needIndexing2 = (entry: BytesMapFieldEntry) => {
  return (
    // !bytesToStr(entry.key).startsWith("BALANCE") &&
    !bytesToStr(entry.key).startsWith("ALLOWANCE") &&
    !bytesToStr(entry.key).startsWith("oracle::") &&
    !bytesToStr(entry.key).startsWith("status")
  );
};

const needIndexing = (op: SignedOperation) => {
  const opType = op.content?.op?.type;
  if (opType?.oneofKind !== "callSc") return false;
  return ADDRESSES.includes(opType.callSc.targetAddress);
};

const processLedgerChanges = async (
  stateChanges: StateChanges,
  blockId: string
) => {
  const filteredChanges = stateChanges.ledgerChanges.filter((change) => {
    if (!ADDRESSES.includes(change.address) || !change.value?.entry)
      return false;
    const entry = change.value.entry;
    return (
      (entry.oneofKind === "updatedEntry" &&
        entry.updatedEntry.datastore.length) ||
      (entry.oneofKind === "createdEntry" &&
        entry.createdEntry.datastore.length)
    );
  });

  const data = filteredChanges.flatMap((change, i) => {
    const entry = change.value?.entry;
    if (!entry) return [];

    if (entry.oneofKind === "createdEntry") {
      return entry.createdEntry.datastore.flatMap((datastore) =>
        needIndexing2(datastore)
          ? {
              address: change.address,
              key: Buffer.from(datastore.key),
              value: Buffer.from(datastore.value),
              blockId,
            }
          : []
      );
    }
    if (entry.oneofKind === "updatedEntry") {
      return entry.updatedEntry.datastore.flatMap((datastore) =>
        datastore.change.oneofKind === "set" &&
        needIndexing2(datastore.change.set)
          ? {
              address: change.address,
              key: Buffer.from(datastore.change.set.key),
              value: Buffer.from(datastore.change.set.value),
              blockId,
            }
          : []
      );
    }
    return [];
  });
  if (!data.length) return;

  await prisma.ledgerChange
    .createMany({
      data,
    })
    .catch(handlePrismaError);
};
