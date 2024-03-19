import { Args, ArrayTypes } from "@massalabs/massa-web3";
import {
  AddLiquidityParameters,
  Address,
  RemoveLiquidityParameters,
  EventDecoder,
  SwapRouterMethod,
  LimitOrder,
  SwapEvent,
} from "@dusalabs/sdk";
import { NativeAmount } from "../gen/ts/massa/model/v1/amount";
import { WMAS } from "../../common/contracts";
import { DCA, Order } from "@prisma/client";

// TODO: move to sdk
export interface SwapParams {
  amountIn: bigint;
  amountOut: bigint;
  binSteps: bigint[];
  path: Address[];
  to: string;
  deadline: number;
}

const extractAmountInOut = (
  method: string,
  args: Args,
  coins: NativeAmount | undefined
) => {
  switch (method) {
    case "swapExactTokensForTokens": {
      const amountIn = args.nextU256();
      const amountOutMin = args.nextU256();
      return { amountIn, amountOut: amountOutMin };
    }
    case "swapTokensForExactTokens": {
      const amountOut = args.nextU256();
      const amountInMax = args.nextU256();
      return { amountIn: amountInMax, amountOut };
    }
    case "swapExactMASForTokens": {
      if (!coins) throw new Error("coins not defined");
      const amountIn = coins.mantissa;
      const amountOutMin = args.nextU256();
      return { amountIn, amountOut: amountOutMin };
    }
    case "swapExactTokensForMAS": {
      const amountIn = args.nextU256();
      const amountOutMinMAS = args.nextU256();
      return { amountIn, amountOut: amountOutMinMAS };
    }
    case "swapTokensForExactMAS": {
      const amountOut = args.nextU256();
      const amountInMax = args.nextU256();
      return { amountIn: amountInMax, amountOut };
    }
    case "swapMASForExactTokens": {
      if (!coins) throw new Error("coins not defined");
      const amountIn = coins.mantissa;
      const amountOut = args.nextU256();
      return { amountIn, amountOut };
    }
    default: {
      throw new Error("unknown method: " + method);
    }
  }
};

export const decodeSwapTx = (
  method: SwapRouterMethod,
  params: Uint8Array,
  coins: NativeAmount | undefined
): SwapParams => {
  const args = new Args(params);
  const { amountIn, amountOut } = extractAmountInOut(method, args, coins);

  const binSteps = args.nextArray<bigint>(ArrayTypes.U64);
  const path = args.nextSerializableObjectArray(Address);
  const to = args.nextString();
  const deadline = Number(args.nextU64());

  return {
    amountIn,
    amountOut,
    binSteps,
    path,
    to,
    deadline,
  };
};

type DecodedLiquidity = AddLiquidityParameters | RemoveLiquidityParameters;

export const decodeLiquidityTx = (
  isAdd: boolean,
  params: Uint8Array,
  coins: NativeAmount | undefined
): DecodedLiquidity => {
  const isRemoveMAS = !isAdd && coins;
  const args = new Args(params);
  const token0 = args.nextString();
  const token1 = isRemoveMAS ? WMAS.address : args.nextString();
  const binStep = args.nextU32();

  if (isAdd) {
    const amount0 = args.nextU256();
    const amount1 = args.nextU256();
    const amount0Min = args.nextU256();
    const amount1Min = args.nextU256();
    const activeIdDesired = Number(args.nextU64());
    const idSlippage = Number(args.nextU64());
    const deltaIds = args.nextArray<number>(ArrayTypes.I64);
    // const distribution0 = args.nextArray<bigint>(ArrayTypes.U256);
    // const distribution1 = args.nextArray<bigint>(ArrayTypes.U256);
    const to = args.nextString();
    const deadline = Number(args.nextU64());

    return {
      token0,
      token1,
      binStep,
      amount0,
      amount1,
      amount0Min,
      amount1Min,
      activeIdDesired,
      idSlippage,
      deltaIds,
      distributionX: [], //distribution0,
      distributionY: [], //distribution1,
      to,
      deadline,
    };
  } else {
    const amount0Min = args.nextU256();
    const amount1Min = args.nextU256();
    const ids = args.nextArray<number>(ArrayTypes.U64);
    const amounts = args.nextArray<bigint>(ArrayTypes.U256);
    const to = args.nextString();
    const deadline = Number(args.nextU64());

    return {
      token0,
      token1,
      binStep,
      amount0Min,
      amount1Min,
      ids,
      amounts,
      to,
      deadline,
    };
  }
};

export const decodeDcaTx = (
  params: Uint8Array
): Omit<DCA, "userAddress" | "txHash" | "id" | "status"> => {
  const args = new Args(params);
  const amountEachDCA = args.nextU256();
  const interval = Number(args.nextU64());
  const nbOfDCA = Number(args.nextU64());

  const tokenPathStr: string[] = args.nextArray(ArrayTypes.STRING);
  const tokenIn = tokenPathStr[0];
  const tokenOut = tokenPathStr[tokenPathStr.length - 1];

  const startTimestamp = Date.now() + Number(args.nextU64());
  const duration = nbOfDCA == 0 ? 0 : (interval * (2 * nbOfDCA - 1)) / 2;
  const endTimestamp = startTimestamp + duration;

  return {
    amountEachDCA: amountEachDCA.toString(),
    interval,
    nbOfDCA,
    tokenIn,
    tokenOut,
    startTime: new Date(startTimestamp),
    endTime: new Date(endTimestamp),
  };
};

export const decodeOrderTx = (
  params: Uint8Array
): Omit<Order, "userAddress" | "txHash" | "id" | "status"> => {
  // prettier-ignore
  const {amountIn, amountOutMin, binId, pair: poolAddress, deadline, swapForY} = new Args(params).nextSerializable(LimitOrder);
  return {
    amountIn: amountIn.toString(),
    amountOutMin: amountOutMin.toString(),
    poolAddress,
    deadline: new Date(Number(deadline)),
    binId,
    swapForY,
  };
};

/**
 * Decode swap events
 * @param events - string array starting with SWAP
 * @returns
 */
export const decodeSwapEvents = (events: string[]): SwapEvent[] => {
  return events.reduce((prev, event) => {
    prev.push(EventDecoder.decodeSwap(event));
    return prev;
  }, [] as SwapEvent[]);
};

export const computeSwapPayload = (swapEvents: SwapEvent[]) => {
  const binId = swapEvents[swapEvents.length - 1].activeId;
  const swapForY = swapEvents[swapEvents.length - 1].swapForY;
  const feesIn = swapEvents.reduce((prev, event) => prev + event.feesTotal, 0n);
  const amountIn = swapEvents.reduce(
    (prev, event) => prev + event.amountInToBin,
    feesIn
  );
  const amountOut = swapEvents.reduce(
    (prev, event) => prev + event.amountOutOfBin,
    0n
  );
  const volatilityAccumulated = swapEvents.reduce(
    (prev, event) => prev + event.volatilityAccumulated,
    0
  );
  return {
    binId,
    swapForY,
    amountIn,
    amountOut,
    feesIn,
    volatilityAccumulated,
  };
};

/**
 * Decode liquidity events
 * @param events - string array starting with DEPOSITED_TO_BIN/WITHDRAWN_FROM_BIN
 * @returns
 */
export const decodeLiquidityEvents = (events: string[]) => {
  return events.reduce(
    (prev, event) => {
      const decoded = EventDecoder.decodeLiquidity(event);

      prev.amountX += decoded.amountX;
      prev.amountY += decoded.amountY;
      prev.lowerBound = Math.min(prev.lowerBound, decoded.id);
      prev.upperBound = Math.max(prev.upperBound, decoded.id);

      return prev;
    },
    { amountX: 0n, amountY: 0n, lowerBound: +Infinity, upperBound: -Infinity }
  );
};
