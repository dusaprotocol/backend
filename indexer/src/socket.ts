import {
  adjustPrice,
  calculateUSDLocked,
  getBinStep,
  getCallee,
  getPriceFromId,
  getTokenFromAddress,
  getTokenValue,
  sortTokens,
  toFraction,
} from "../../common/methods";
import { SwapParams, decodeLiquidityEvents, decodeSwapEvents } from "./decoder";
import { EventDecoder, ILBPair, TokenAmount } from "@dusalabs/sdk";
import { createSwap, createLiquidity } from "./db";
import { web3Client } from "../../common/client";
import { getTimestamp } from "../../common/utils";
import { ScExecutionEvent } from "../gen/ts/massa/model/v1/execution";
import { bytesToStr } from "@massalabs/massa-web3";

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

  const { volume, fees } = await calculateSwapValue({
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
};

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
  tokenInAddress: string;
  tokenOutAddress: string;
  binStep: number;
  amountIn: bigint;
  feesIn: bigint;
  binId: number;
}) => {
  // prettier-ignore
  const { tokenInAddress, tokenOutAddress, binStep, amountIn, feesIn, binId } = params;
  const tokenIn = await getTokenFromAddress(tokenInAddress);
  const tokenOut = await getTokenFromAddress(tokenOutAddress);
  const [token0, token1] = sortTokens(tokenIn, tokenOut);
  const price = getPriceFromId(binId, binStep);
  const priceAdjusted = adjustPrice(price, token0.decimals, token1.decimals);

  const valueIn = await getTokenValue(tokenInAddress, true);
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
