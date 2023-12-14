import { Args, ArrayTypes } from "@massalabs/massa-web3";
import {
  AddLiquidityParameters,
  Address,
  StartDCAParameters,
  RemoveLiquidityParameters,
  Token,
  TokenAmount,
  EventDecoder,
  SwapRouterMethod,
} from "@dusalabs/sdk";
import { getPriceFromId, getTokenFromAddress } from "../../common/methods";
import { NativeAmount } from "../gen/ts/massa/model/v1/amount";

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
  const args = new Args(params);
  const token0 = args.nextString();
  const token1 = args.nextString();
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
): Omit<StartDCAParameters, "startIn" | "tokenPath"> & {
  tokenIn: string;
  tokenOut: string;
  startTime: Date;
  endTime: Date;
} => {
  const args = new Args(params);
  const amountEachDCA = args.nextU256();
  const interval = Number(args.nextU64());
  const nbOfDCA = Number(args.nextU64());
  const tokenPath: Address[] = args.nextSerializableObjectArray(Address);
  const tokenIn = tokenPath[0].str;
  const tokenOut = tokenPath[tokenPath.length - 1].str;
  const startIn = Number(args.nextU64());

  const startTime = Date.now() + startIn;
  const endTime =
    nbOfDCA == 0 ? Infinity : startTime + (interval * (2 * nbOfDCA - 1)) / 2;

  return {
    amountEachDCA,
    interval,
    nbOfDCA,
    tokenIn,
    tokenOut,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
  };
};

const toLog = async (params: SwapParams) => {
  const tokenInAddress = params.path[0].str;
  const tokenOutAddress = params.path[params.path.length - 1].str;
  const tokenIn = await getTokenFromAddress(tokenInAddress);
  const tokenOut = await getTokenFromAddress(tokenOutAddress);
  if (!tokenIn || !tokenOut) return;

  const parsedAmountIn = new TokenAmount(tokenIn, params.amountIn);
  const parsedAmountOut = new TokenAmount(tokenOut, params.amountOut);

  return {
    route: params.path.map((token) => `${token.str}`).join(", "),
    inputAmount: `${parsedAmountIn.toSignificant(6)} ${
      parsedAmountIn.currency.symbol
    }`,
    outputAmount: `${parsedAmountOut.toSignificant(6)} ${
      parsedAmountOut.currency.symbol
    }`,
  };
};

/**
 * Decode swap events
 * @param events - string array starting with SWAP
 * @returns
 */
export const decodeSwapEvents = (events: string[]) => {
  return events.reduce(
    (prev, event) => {
      const { activeId, swapForY, amountInToBin, amountOutOfBin, feesTotal } =
        EventDecoder.decodeSwap(event);

      prev.binId = activeId;
      prev.swapForY = swapForY;
      prev.amountIn += amountInToBin + feesTotal;
      prev.amountOut += amountOutOfBin;
      prev.totalFees += feesTotal;

      return prev;
    },
    { binId: 0, swapForY: false, amountIn: 0n, amountOut: 0n, totalFees: 0n }
  );
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
