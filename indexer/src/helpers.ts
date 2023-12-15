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
import { fetchDCA, fetchPairAddress, getCallee } from "../../common/methods";
import { ONE_MINUTE, getTimestamp, wait } from "../../common/utils";
import {
  decodeDcaTx,
  decodeSwapTx,
  decodeLiquidityTx,
  decodeOrderTx,
} from "./decoder";
import { processSwap, processLiquidity } from "./socket";
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

  events.forEach(async (event) => {
    try {
      if (!event.context) return;

      const eventData = bytesToStr(event.data);
      const { callStack } = event.context;
      if (callStack.includes(dcaSC)) {
        // handle inner swap
        // const swapEvent = events.find((e) =>
        //   bytesToStr(e.data).startsWith("SWAP:")
        // );
        // if (!swapEvent) return;

        // handle dca execution
        if (eventData.startsWith("DCA_EXECUTED:")) {
          const { amountOut, id, user } =
            EventDecoder.decodeDCAExecution(eventData);
          const dca = await findDCA(id).catch(async () => {
            logger.warn(
              `DCA ${id} not found in db, fetching datastore in 30 sec`
            );
            await wait(ONE_MINUTE / 2);
            return fetchDCA(id, user)
              .then(async (_dca) => {
                console.log({ _dca });
                logger.info(`DCA ${id} fetched from datastore`);
                await createDCA(_dca).catch(() => {
                  logger.warn(`Insert DCA ${id} went wrong`);
                });
                return _dca;
              })
              .catch((err) => {
                logger.warn(`DCA ${id} not found`);
                throw err;
              });
          });
          if (!dca) return; // TODO: fetch dca from datastore or wait 1 min and retry

          await prisma.dCAExecution.create({
            data: {
              amountIn: dca.amountEachDCA,
              amountOut,
              dCAId: id,
              period,
              thread,
              blockId,
            },
          });

          const nbOfExecutions = await prisma.dCAExecution.count({
            where: {
              dCAId: id,
            },
          });

          if (dca.nbOfDCA === nbOfExecutions) updateDCAStatus(id, Status.ENDED);
        }
      } else if (callStack.includes(orderSC)) {
        // handle inner swap
        // const swapEvent = events.find((e) =>
        //   bytesToStr(e.data).startsWith("SWAP:")
        // );
        // if (!swapEvent) return;

        // handle limit order execution
        if (eventData.startsWith("EXECUTE_LIMIT_ORDER:")) {
          const { id, amountOut } =
            EventDecoder.decodeLimitOrderExecution(eventData);
          const order = await prisma.order.findUnique({
            where: {
              id,
            },
          });
          if (!order) return; // TODO: fetch order from datastore or wait 1 min and retry

          await prisma.orderExecution.create({
            data: {
              amountIn: order.amountIn,
              amountOut,
              orderId: id,
              period,
              thread,
              blockId,
            },
          });
          await prisma.order.update({
            where: {
              id,
            },
            data: {
              status: "ENDED",
            },
          });
        }
      } else return;
    } catch (err: any) {
      logger.error(err.message);
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

  const { events, eventPoller } = await withTimeoutRejection(
    pollAsyncEvents(txHash),
    ONE_MINUTE
  );
  eventPoller.stopPolling();

  // PERIPHERY CONTRACTS

  if (targetAddress === dcaSC) {
    switch (targetFunction) {
      case "startDCA": {
        const dca = decodeDcaTx(parameter);

        const event = events.find((e) => e.data.startsWith("DCA_ADDED:"))?.data;
        if (!event) return;

        const id = EventDecoder.decodeDCA(event).id;
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
  } else {
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

        const swapEvents = events.filter(
          (e) =>
            getCallee(e.context.call_stack) === poolAddress &&
            e.data.startsWith("SWAP:")
        );

        processSwap({
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

      const liqEvents = events.filter(
        (e) =>
          getCallee(e.context.call_stack) === poolAddress &&
          ["DEPOSITED_TO_BIN:", "WITHDRAWN_FROM_BIN:"].some(
            e.data.startsWith.bind(e.data)
          )
      );

      processLiquidity({
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
}

const isSwapMethod = (str: string): str is SwapRouterMethod =>
  !!SWAP_ROUTER_METHODS.find((method) => str === method);

const isLiquidtyMethod = (str: string): str is LiquidityRouterMethod =>
  !!LIQUIDITY_ROUTER_METHODS.find((method) => str === method);
