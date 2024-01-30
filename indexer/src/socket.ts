import {
  adjustPrice,
  calculateUSDLocked,
  fetchDCA,
  getBinStep,
  getCallee,
  getDatastoreKeys,
  getPriceFromId,
  getTokenFromAddress,
  getTokenValue,
  sortTokens,
  toFraction,
} from "../../common/methods";
import {
  SwapParams,
  decodeLiquidityEvents,
  decodeSwapBins,
  decodeSwapEvents,
} from "./decoder";
import {
  EventDecoder,
  Fraction,
  ILBPair,
  Token,
  TokenAmount,
} from "@dusalabs/sdk";
import {
  createSwap,
  createLiquidity,
  createDCA,
  findDCA,
  updateDCAStatus,
  updateMakerFees,
} from "./db";
import { web3Client } from "../../common/client";
import { ONE_MINUTE, getTimestamp, wait } from "../../common/utils";
import { ScExecutionEvent } from "../gen/ts/massa/model/v1/execution";
import {
  Args,
  bytesToStr,
  bytesToU256,
  strToBytes,
} from "@massalabs/massa-web3";
import { Status } from "@prisma/client";
import { prisma } from "../../common/db";
import logger from "../../common/logger";

export const processInnerSwap = async (params: {
  event: ScExecutionEvent;
  callStack: string[];
  blockId: string;
  i: number;
}) => {
  const { event, callStack, blockId, i } = params;
  const eventData = bytesToStr(event.data);
  const poolAddress = getCallee(callStack);
  const tokens = await new ILBPair(poolAddress, web3Client).getTokens();
  const swapForY = EventDecoder.decodeSwap(eventData).swapForY;
  const tokenInAddress = swapForY ? tokens[0] : tokens[1];
  const tokenOutAddress = swapForY ? tokens[1] : tokens[0];
  const binStep = await getBinStep(poolAddress);
  const userAddress = callStack[0];

  processSwap({
    poolAddress,
    tokenInAddress,
    tokenOutAddress,
    binStep,
    swapEvents: [eventData],
    txHash: blockId,
    indexInSlot: i,
    timestamp: getTimestamp(event),
    userAddress,
  });
};

export const processSwap = async (params: {
  txHash: string;
  indexInSlot: number;
  userAddress: string;
  timestamp: string | Date;
  poolAddress: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  binStep: number;
  swapEvents: string[];
  swapParams?: SwapParams;
}) => {
  // prettier-ignore
  const { txHash, userAddress, timestamp, poolAddress, swapEvents, indexInSlot } = params;
  const swapPayload = decodeSwapEvents(swapEvents);

  const [tokenIn, tokenOut] = await Promise.all(
    [params.tokenInAddress, params.tokenOutAddress].map((address) =>
      getTokenFromAddress(address)
    )
  );
  const [_, tokenY] = sortTokens(tokenIn, tokenOut);

  const { volume, fees, priceAdjusted } = await calculateSwapValue({
    tokenIn,
    tokenOut,
    ...params,
    ...swapPayload,
  });

  await createSwap({
    ...swapPayload,
    timestamp,
    txHash,
    usdValue: volume,
    feesUsdValue: fees,
    poolAddress,
    userAddress,
    indexInSlot,
    amountIn: swapPayload.amountIn.toString(),
    amountOut: swapPayload.amountOut.toString(),
    feesIn: swapPayload.feesIn.toString(),
  });

  const crossedBins = decodeSwapBins(swapEvents);
  const pair = new ILBPair(poolAddress, web3Client);
  crossedBins.forEach(async (binId) => {
    const binSupply = await pair.getSupplies([binId]).then((r) => r[0]);
    const makers = await getDatastoreKeys(poolAddress).then((r) =>
      r
        .filter((k) => k.startsWith(`balances::${binId}`)) // only user addresses, no smart contracts
        .map((k) => k.split(`::${binId}`)[1])
    );
    const balances = await pair.balanceOfBatch(
      makers,
      Array.from({ length: makers.length }, () => binId)
    );
    const tokenYValue = await getTokenValue(tokenY);
    makers.forEach(async (maker, i) => {
      const share = new Fraction(balances[i]).divide(binSupply);
      const accruedFees = share.multiply(swapPayload.feesIn).quotient;
      const accruedFeesX = swapPayload.swapForY ? accruedFees : 0n;
      const accruedFeesY = swapPayload.swapForY ? 0n : accruedFees;
      const price = getPriceFromId(binId, params.binStep);
      const accruedFeesL = swapPayload.swapForY
        ? new Fraction(accruedFeesX).multiply(toFraction(price)).quotient
        : accruedFeesY;
      const accruedFeesUsd = Number(
        new TokenAmount(tokenY, accruedFeesL)
          .multiply(toFraction(tokenYValue))
          .toSignificant(6)
      );
      if (accruedFeesUsd === 0) return;

      await updateMakerFees({
        accruedFeesL: accruedFeesL.toString(),
        accruedFeesUsd,
        accruedFeesX: accruedFeesX.toString(),
        accruedFeesY: accruedFeesY.toString(),
        address: maker,
        poolAddress,
      });
    });
  });
};

export const processRewards = async (params: {}) => {};

export const processLiquidity = async (params: {
  txHash: string;
  userAddress: string;
  timestamp: string | Date;
  poolAddress: string;
  token0Address: string;
  token1Address: string;
  liqEvents: string[];
  isAdd: boolean;
}) => {
  // prettier-ignore
  const { txHash, userAddress, timestamp, poolAddress, liqEvents, isAdd, token0Address, token1Address } = params;
  const { amountX, amountY, lowerBound, upperBound } =
    decodeLiquidityEvents(liqEvents);
  const [amount0, amount1] = isAdd ? [amountX, amountY] : [-amountY, -amountX];
  const token0 = await getTokenFromAddress(token0Address);
  const token1 = await getTokenFromAddress(token1Address);
  const usdValue = await calculateUSDLocked(token0, amount0, token1, amount1);

  await createLiquidity({
    amount0: amount0.toString(),
    amount1: amount1.toString(),
    upperBound,
    lowerBound,
    timestamp,
    txHash,
    usdValue,
    poolAddress,
    userAddress,
  });
};

export const calculateSwapValue = async (params: {
  tokenIn: Token;
  tokenOut: Token;
  binStep: number;
  amountIn: bigint;
  feesIn: bigint;
  binId: number;
}) => {
  // prettier-ignore
  const { tokenIn, tokenOut, binStep, amountIn, feesIn, binId } = params;

  const [token0, token1] = sortTokens(tokenIn, tokenOut);
  const price = getPriceFromId(binId, binStep);
  const priceAdjusted = adjustPrice(price, token0.decimals, token1.decimals);

  const valueIn = await getTokenValue(tokenIn);
  const volume = Number(
    new TokenAmount(tokenIn, amountIn)
      .multiply(toFraction(valueIn))
      .toSignificant(6)
  );
  // fees are stored in cents
  const fees = Number(
    new TokenAmount(tokenIn, feesIn)
      .multiply(toFraction(valueIn))
      .toSignificant(6)
  );

  return { volume, fees, priceAdjusted };
};

export const processDCAExecution = async (
  eventData: string,
  blockInfo: { thread: number; period: number; blockId: string }
) => {
  if (eventData.startsWith("DCA_EXECUTED:")) {
    const { amountOut, id, user } = EventDecoder.decodeDCAExecution(eventData);
    const dca = await findDCA(id).then(async (res) => {
      if (res) return res;

      await wait(ONE_MINUTE / 2);
      const resRetry = await findDCA(id);
      if (resRetry) return resRetry;

      return fetchDCA(id, user).then(async (_dca) => {
        await createDCA(_dca).catch(() =>
          logger.warn("createDCA failed", _dca)
        );
        return _dca;
      });
    });
    if (!dca) return;

    await prisma.dCAExecution.create({
      data: {
        ...blockInfo,
        amountIn: dca.amountEachDCA,
        amountOut: amountOut.toString(),
        dCAId: id,
      },
    });

    if (
      dca.endTime.getTime() !== dca.startTime.getTime() &&
      dca.endTime.getTime() < Date.now()
    )
      updateDCAStatus(id, Status.ENDED);
  }
};

export const processOrderExecution = async (
  eventData: string,
  blockInfo: { thread: number; period: number; blockId: string }
) => {
  const { id, amountOut } = EventDecoder.decodeLimitOrderExecution(eventData);
  const order = await prisma.order.findUnique({
    where: {
      id,
    },
  });
  if (!order) return; // TODO: fetch order from datastore or wait 1 min and retry

  await prisma.orderExecution.create({
    data: {
      ...blockInfo,
      amountIn: order.amountIn,
      amountOut: amountOut.toString(),
      orderId: id,
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
};
