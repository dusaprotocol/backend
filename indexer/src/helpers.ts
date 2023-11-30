import {
  SWAP_ROUTER_METHODS,
  LIQUIDITY_ROUTER_METHODS,
  EventDecoder,
  SwapRouterMethod,
} from "@dusalabs/sdk";
import { EOperationStatus, IEvent, bytesToStr } from "@massalabs/massa-web3";
import { Status } from "@prisma/client";
import { web3Client } from "../../common/client";
import { dcaSC, orderSC, routerSC } from "../../common/contracts";
import { prisma } from "../../common/db";
import logger from "../../common/logger";
import { fetchPairAddress, getCallee } from "../../common/methods";
import {
  fetchEvents,
  getGenesisTimestamp,
  parseSlot,
} from "../../common/utils";
import { decodeDcaTx, decodeSwapTx, decodeLiquidityTx } from "./decoder";
import { processSwap, processLiquidity } from "./socket";
import { CallSC, Operation } from "../gen/ts/massa/model/v1/operation";
import {
  NewOperationsResponse,
  NewSlotExecutionOutputsResponse,
} from "../gen/ts/massa/api/v1/public";

export async function handleNewSlotExecutionOutputs(
  message: NewSlotExecutionOutputsResponse
) {
  console.log(message.output?.executionOutput?.slot);
  const events = message.output?.executionOutput?.events;
  if (!events) return;

  events.forEach(async (event) => {
    if (!event.context) return;

    const { callStack } = event.context;
    if (callStack.includes(dcaSC)) {
      // handle inner swap
      const swapEvent = events.find((e) =>
        bytesToStr(e.data).startsWith("SWAP:")
      );
      if (!swapEvent) return;
      console.log(swapEvent?.data);

      // handle dca execution
      if (bytesToStr(event.data).startsWith("DCA_EXECUTED:")) {
        const [owner, _id, _amountOut] = bytesToStr(event.data)
          .split(":")[1]
          .split(",");
        const id = parseInt(_id);
        const amountOut = EventDecoder.decodeU256(_amountOut);
        console.log("DCA_EXECUTED", owner, id, amountOut);

        // TODO: fetch DCA from datastore if its not already in the db

        prisma.dCAExecution
          .create({
            data: {
              amountIn: 0,
              amountOut: 0,
              id,
              txHash: "",
              timestamp: new Date(),
              DCA: {
                connect: {
                  id,
                },
              },
            },
          })
          .then(console.log)
          .catch((e) => console.log(JSON.stringify(e)));
      }
    } else if (callStack.includes(orderSC)) {
    } else return;
  });
}

export async function handleNewOperations(message: NewOperationsResponse) {
  if (!message.signedOperation) return;
  const {
    secureHash: txId,
    contentCreatorAddress: caller,
    content: operation,
  } = message.signedOperation;
  const opType = operation?.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const { targetAddress, targetFunction, parameter, coins } = opType.callSc;
  const indexedSC = [dcaSC, orderSC, routerSC];

  if (!indexedSC.includes(targetAddress)) return;

  console.log(targetAddress, targetFunction, caller);
  await awaitOperationStatus(txId).then(console.log);
  const events = await fetchEvents({ original_operation_id: txId });

  // PERIPHERY CONTRACTS

  if (targetAddress === dcaSC) {
    switch (targetFunction) {
      case "startDCA": {
        const dca = decodeDcaTx(parameter);
        console.log(dca);

        const event = events.find((e) => e.data.startsWith("DCA_ADDED:"))?.data;
        console.log(event);
        if (!event) return;

        const id = EventDecoder.decodeDCA(event).id;
        console.log(id);
        if (!dca || !id) return;

        await prisma.dCA
          .create({
            data: {
              ...dca,
              userAddress: caller,
              txHash: txId,
              id,
              status: Status.ACTIVE,
            },
          })
          .then(console.log)
          .catch(console.log);
        break;
      }
      case "stopDCA": {
        const event = events.find((e) =>
          e.data.startsWith("DCA_CANCELLED:")
        )?.data;
        if (!event) return;

        const id = EventDecoder.decodeDCA(event).id;

        await prisma.dCA
          .update({
            where: {
              id,
            },
            data: {
              status: Status.STOPPED,
            },
          })
          .then(console.log)
          .catch(console.log);
        break;
      }
      case "updateDCA": {
        // const dca = decodeDcaTx(param);
        // const event = events.find((e) =>
        //   e.data.startsWith("DCA_UPDATED:")
        // )?.data;
        // if (!event) return;

        // const id = EventDecoder.decodeDCA(event).id;
        // if (!dca || !id) return;

        // await prisma.dCA
        //   .update({
        //     where: { id },
        //     data: {
        //       ...dca,
        //     },
        //   })
        //   .then(console.log)
        //   .catch(console.log);
        break;
      }
      default:
        break;
    }
  } else if (targetAddress === orderSC) {
    switch (targetFunction) {
      case "addLimitOrder": {
        const event = events.find((e) =>
          e.data.startsWith("NEW_LIMIT_ORDER:")
        )?.data;
        if (!event) return;

        const { id } = EventDecoder.decodeLimitOrder(event);
        if (!id) return;
        break;
      }
      case "removeLimitOrder":
        const event = events.find((e) =>
          e.data.startsWith("REMOVE_LIMIT_ORDER:")
        )?.data;
        if (!event) return;

        const { id } = EventDecoder.decodeLimitOrder(event);
        if (!id) return;
        break;
      default:
        break;
    }
  } else {
    const status = await awaitOperationStatus(txId);
    const events = await fetchEvents({ original_operation_id: txId });
    const timestamp = await getTimestamp(events);

    if (isSwapMethod(targetFunction)) {
      const swapParams = decodeSwapTx(targetFunction, parameter, coins);
      for (let i = 0; i < swapParams.path.length - 1; i++) {
        const tokenIn = swapParams.path[i].str;
        const tokenOut = swapParams.path[i + 1].str;
        const binStep = Number(swapParams.binSteps[i]);
        const pairAddress = await fetchPairAddress(tokenIn, tokenOut, binStep);

        processSwap(
          txId,
          i,
          caller,
          timestamp,
          pairAddress,
          tokenIn,
          tokenOut,
          binStep,
          events
            .filter(
              (e) =>
                getCallee(e.context.call_stack) === pairAddress &&
                e.data.startsWith("SWAP:")
            )
            .map((e) => e.data),
          swapParams
        );
      }
    } else if (isLiquidtyMethod(targetFunction)) {
      const isAdd = targetFunction.startsWith("add");
      const liquidityParams = decodeLiquidityTx(isAdd, parameter, coins);
      const { token0, token1, binStep } = liquidityParams;
      const pairAddress = await fetchPairAddress(token0, token1, binStep);

      processLiquidity(
        txId,
        caller,
        timestamp,
        pairAddress,
        token0,
        token1,
        events
          .filter(
            (e) =>
              e.data.startsWith("DEPOSITED_TO_BIN:") ||
              e.data.startsWith("WITHDRAWN_FROM_BIN:")
          )
          .map((e) => e.data),
        isAdd
      );
    } else throw new Error("Unknown router method:" + targetFunction);
  }
}

export async function awaitOperationStatus(
  txId: string,
  requiredStatus: EOperationStatus = EOperationStatus.SPECULATIVE_SUCCESS
) {
  return web3Client
    .smartContracts()
    .awaitRequiredOperationStatus(txId, requiredStatus)
    .then((status) => {
      if (status !== requiredStatus) {
        throw new Error("Operation status is not FINAL_SUCCESS");
      }
      return status;
    });
}

const isSwapMethod = (str: string): str is SwapRouterMethod =>
  !!SWAP_ROUTER_METHODS.find((lit) => str === lit);

const isLiquidtyMethod = (str: string): str is SwapRouterMethod =>
  !!LIQUIDITY_ROUTER_METHODS.find((lit) => str === lit);

export async function getTimestamp(events: IEvent[]) {
  const genesisTimestamp = await getGenesisTimestamp();
  return new Date(parseSlot(events[0].context.slot, genesisTimestamp));
}
