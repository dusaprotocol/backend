import { SWAP_ROUTER_METHODS, LIQUIDITY_ROUTER_METHODS } from "@dusalabs/sdk";
import { EOperationStatus, IEvent } from "@massalabs/massa-web3";
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

export async function processOperation(
  operation: Operation,
  caller: string,
  txId: string
) {
  const opType = operation.op?.type;
  if (opType?.oneofKind !== "callSc") return;

  const { targetAddr, targetFunc, param } = opType.callSc;

  // PERIPHERY CONTRACTS

  console.log(targetAddr, targetFunc, param);
  if (targetAddr === dcaSC) {
    switch (targetFunc) {
      case "startDca": {
        const dca = decodeDcaTx(param);

        await awaitOperationStatus(txId);
        const events = await fetchEvents({ original_operation_id: txId });
        const id = parseInt(
          events
            .find((e) => e.data.startsWith("DCA_ADDED:"))
            ?.data.split(",")[1] as string
        );
        if (!dca || !id) return;

        await prisma.dCA.create({
          data: {
            ...dca,
            userAddress: caller,
            txHash: txId,
            id,
            status: Status.ACTIVE,
          },
        });
      }
      case "stopDca": {
        await awaitOperationStatus(txId);
        const events = await fetchEvents({ original_operation_id: txId });
        const id = parseInt(
          events
            .find((e) => e.data.startsWith("DCA_CANCELLED:"))
            ?.data.split(",")[1] as string
        );
        await prisma.dCA.update({
          where: {
            id,
          },
          data: {
            status: Status.STOPPED,
          },
        });
      }
      case "updateDCA": {
        const dca = decodeDcaTx(param);

        await awaitOperationStatus(txId);
        const events = await fetchEvents({ original_operation_id: txId });
        const id = parseInt(
          events
            .find((e) => e.data.startsWith("DCA_UPDATED:"))
            ?.data.split(",")[1] as string
        );
        if (!dca || !id) return;

        await prisma.dCA.update({
          where: { id },
          data: {
            ...dca,
          },
        });
      }
      default:
        break;
    }
    return;
  } else if (targetAddr === orderSC) {
    switch (targetFunc) {
      case "addLimitOrder":
      case "removeLimitOrder":
        break;
      default:
        break;
    }
    return;
  }

  // CORE CONTRACTS

  if (targetAddr !== routerSC) return;

  try {
    const status = await awaitOperationStatus(txId);
    const events = await fetchEvents({ original_operation_id: txId });
    const timestamp = await getTimestamp(events);

    if (SWAP_ROUTER_METHODS.includes(targetFunc as any)) {
      await processSwapOperation(
        opType.callSc,
        txId,
        caller,
        timestamp,
        events
      );
    } else if (LIQUIDITY_ROUTER_METHODS.includes(targetFunc as any)) {
      await processLiquidityOperation(
        opType.callSc,
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

export async function awaitOperationStatus(txId: string) {
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

export async function getTimestamp(events: IEvent[]) {
  const genesisTimestamp = await getGenesisTimestamp();
  return new Date(parseSlot(events[0].context.slot, genesisTimestamp));
}

export async function processSwapOperation(
  operation: CallSC,
  txId: string,
  caller: string,
  timestamp: Date,
  events: IEvent[]
) {
  const { targetFunc: method, param: args, coins } = operation;
  const swapParams = await decodeSwapTx(method, args, coins);
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
  }
}

export async function processLiquidityOperation(
  operation: CallSC,
  txId: string,
  caller: string,
  timestamp: Date,
  events: IEvent[]
) {
  const { targetFunc: method, param: args, coins } = operation;
  const isAdd = method.startsWith("add");
  const liquidityParams = await decodeLiquidityTx(isAdd, args, coins);
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
        events
          .filter(
            (e) =>
              e.data.startsWith("DEPOSITED_TO_BIN:") ||
              e.data.startsWith("WITHDRAWN_FROM_BIN:")
          )
          .map((e) => e.data),
        isAdd
      );
    }
  }
}

export async function processDCA(user: string) {
  // prisma.dCA.update({ where: { userAddress: user }, data: {} });
}
