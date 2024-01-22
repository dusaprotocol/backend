import {
  SWAP_ROUTER_METHODS,
  LIQUIDITY_ROUTER_METHODS,
  EventDecoder,
  SwapRouterMethod,
  LiquidityRouterMethod,
} from "@dusalabs/sdk";
import { bytesToStr, withTimeoutRejection } from "@massalabs/massa-web3";
import { dcaSC, orderSC, routerSC } from "../../common/contracts";
import { prisma } from "../../common/db";
import {
  fetchPairAddress,
  isLiquidityEvent,
  isSwapEvent,
} from "../../common/methods";
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
  NewOperationsResponse,
  NewSlotExecutionOutputsResponse,
} from "../gen/ts/massa/api/v1/public";
import { pollAsyncEvents } from "./eventPoller";
import { createDCA, findDCA, updateDCAStatus } from "./db";
import { DCA, Status } from "@prisma/client";
import logger from "../../common/logger";

export async function handleNewSlotExecutionOutputs(
  message: NewSlotExecutionOutputsResponse
) {
  const output = message.output?.executionOutput;
  if (!output) return;
  const { events, slot, blockId: block } = output;
  const period = Number(slot?.period) || 0;
  const thread = Number(slot?.thread) || 0;
  const blockId = block?.value || "";
  if (!events) return;

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
    } catch (err) {
      logger.warn(JSON.stringify(event));
      throw err;
    }
  });
}

export async function handleNewOperations(message: NewOperationsResponse) {
  if (!message.signedOperation) return;
  const {
    secureHash: txHash,
    contentCreatorAddress: userAddress,
    content: operation,
  } = message.signedOperation;
  const opType = operation?.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const { targetAddress, targetFunction, parameter, coins } = opType.callSc;
  const indexedSC = [dcaSC, orderSC, routerSC];
  if (!indexedSC.includes(targetAddress)) return;

  const { events, eventPoller, isError } = await withTimeoutRejection(
    pollAsyncEvents(txHash),
    ONE_MINUTE
  );
  eventPoller.stopPolling();
  if (isError) return;

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
        case "updateDCA": // TODO: update DCA
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

          await prisma.order.create({
            data: {
              ...order,
              id,
              userAddress,
              txHash,
              status: "ACTIVE",
            },
          });
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
  } catch (err) {
    logger.warn(JSON.stringify(events));
    throw err;
  }
}

const isSwapMethod = (str: string): str is SwapRouterMethod =>
  !!SWAP_ROUTER_METHODS.find((method) => str === method);

const isLiquidtyMethod = (str: string): str is LiquidityRouterMethod =>
  !!LIQUIDITY_ROUTER_METHODS.find((method) => str === method);
