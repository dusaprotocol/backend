import {
  adjustPrice,
  getBinStep,
  getCallee,
  getPriceFromId,
  getTokenFromAddress,
  getTokenValue,
  sortTokens,
  toFraction,
} from "../../common/methods";
import { SwapParams, decodeLiquidityEvents, decodeSwapEvents } from "./decoder";
import { ILBPair, TokenAmount } from "@dusalabs/sdk";
import { updateVolumeAndPrice, createSwap, createLiquidity } from "./db";
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
  if (eventData.startsWith("SWAP:")) {
    const poolAddress = getCallee(callStack);
    const [tokenInAddress, tokenOutAddress] = await new ILBPair(
      poolAddress,
      web3Client
    ).getTokens();
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
  }
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
  const { txHash, userAddress, timestamp, poolAddress, binStep, swapEvents, indexInSlot } = params;
  const swapPayload = decodeSwapEvents(swapEvents);

  const { volume, fees, priceAdjusted } = await calculateSwapValue(
    { ...params },
    swapPayload
  );

  updateVolumeAndPrice(poolAddress, binStep, volume, fees, priceAdjusted);
  createSwap({
    ...swapPayload,
    timestamp,
    txHash,
    usdValue: volume,
    poolAddress,
    userAddress,
    indexInSlot,
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
  const usdValue = await calculateLiquidityValue(
    token0Address,
    token1Address,
    amount0,
    amount1
  );

  createLiquidity({
    amount0,
    amount1,
    upperBound,
    lowerBound,
    timestamp,
    txHash,
    usdValue,
    poolAddress,
    userAddress,
  });
};

const calculateSwapValue = async (
  pairInfo: {
    tokenInAddress: string;
    tokenOutAddress: string;
    binStep: number;
  },
  swapPayload: ReturnType<typeof decodeSwapEvents>
) => {
  const { tokenInAddress, tokenOutAddress, binStep } = pairInfo;
  const { amountIn, totalFees, binId } = swapPayload;
  const valueIn = await getTokenValue(tokenInAddress, false);
  const tokenIn = await getTokenFromAddress(tokenInAddress);
  const tokenOut = await getTokenFromAddress(tokenOutAddress);
  const [token0, token1] = sortTokens(tokenIn, tokenOut);
  const price = getPriceFromId(binId, binStep);
  const priceAdjusted = adjustPrice(price, token0.decimals, token1.decimals);
  const volume = Number(
    new TokenAmount(tokenIn, amountIn)
      .multiply(toFraction(valueIn))
      .toSignificant(6)
  );
  // fees are stored in cents
  const fees = Number(
    new TokenAmount(tokenIn, totalFees)
      .multiply(toFraction(valueIn))
      .toSignificant(6)
  );

  return { volume, fees, priceAdjusted };
};

const calculateLiquidityValue = async (
  token0Address: string,
  token1Address: string,
  amount0: bigint,
  amount1: bigint
) => {
  const token0 = await getTokenFromAddress(token0Address);
  const token1 = await getTokenFromAddress(token1Address);

  const token0Value = await getTokenValue(token0Address, false);
  const token1Value = await getTokenValue(token1Address, false);

  return Number(
    new TokenAmount(token0, amount0)
      .multiply(toFraction(token0Value))
      .add(new TokenAmount(token1, amount1).multiply(toFraction(token1Value)))
      .toSignificant(6)
  );
};
