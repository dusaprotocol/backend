import { Args, ArrayTypes } from "@massalabs/massa-web3";
import {
  AddLiquidityParameters,
  Address,
  StartDCAParameters,
  RemoveLiquidityParameters,
  Token,
  TokenAmount,
  EventDecoder,
} from "@dusalabs/sdk";
import { getPriceFromId, getTokenFromAddress } from "../../common/methods";
import { wmasSC } from "../../common/contracts";

export interface SwapParams {
  amountIn: bigint;
  amountOut: bigint;
  binSteps: bigint[];
  path: Address[];
  to: string;
  deadline: bigint;
}

const extractAmountInOut = (method: string, args: Args, coins: bigint) => {
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
      const amountIn = coins;
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
      const amountIn = coins;
      const amountOut = args.nextU256();
      return { amountIn, amountOut };
    }
    default: {
      throw new Error("unknown method: " + method);
    }
  }
};

export const decodeSwapTx = async (
  method: string,
  params: Uint8Array,
  coins: bigint
): Promise<SwapParams | undefined> => {
  try {
    const args = new Args(params);
    const { amountIn, amountOut } = extractAmountInOut(method, args, coins);

    const binSteps = args.nextArray(ArrayTypes.U64) as bigint[];
    const path = args.nextSerializableObjectArray(Address);
    const to = args.nextString();
    const deadline = args.nextU64();

    return {
      amountIn,
      amountOut,
      binSteps,
      path,
      to,
      deadline,
    };
  } catch (e) {
    console.log(e);
  }
};

type DecodedLiquidity = AddLiquidityParameters | RemoveLiquidityParameters;

export const decodeLiquidityTx = async (
  isAdd: boolean,
  params: Uint8Array,
  coins: bigint
): Promise<DecodedLiquidity | undefined> => {
  try {
    const args = new Args(params);
    const token0 = args.nextString();
    const token1 = coins ? wmasSC : args.nextString();
    const binStep = args.nextU32();

    if (isAdd) {
      const amount0 = args.nextU256();
      const amount1 = args.nextU256();
      const amount0Min = args.nextU256();
      const amount1Min = args.nextU256();
      const activeIdDesired = Number(args.nextU64());
      const idSlippage = Number(args.nextU64());
      const deltaIds = args.nextArray<number>(ArrayTypes.I64);
      const distribution0 = args.nextArray<bigint>(ArrayTypes.U256);
      const distribution1 = args.nextArray<bigint>(ArrayTypes.U256);
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
        distributionX: distribution0,
        distributionY: distribution1,
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
  } catch (e) {
    console.log(e);
  }
};

export const decodeDcaTx = (
  params: Uint8Array
):
  | (Omit<StartDCAParameters, "startIn"> & { startTime: Date; endTime: Date })
  | undefined => {
  try {
    const args = new Args(params);
    const amountEachDCA = args.nextU256();
    const interval = Number(args.nextU64());
    const nbOfDCA = Number(args.nextU64());
    const tokenIn = args.nextString();
    const tokenOut = args.nextString();
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
  } catch (e) {
    console.log(e);
  }
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
export const decodeSwapEvents = (events: string[], binStep: number) => {
  let binId = 0;
  let price = 0;
  let swapForY = false;
  let amountIn = 0n;
  let amountOut = 0n;
  let totalFees = 0n;

  events.forEach((event) => {
    const {
      to,
      activeId,
      swapForY: _swapForY,
      amountInToBin,
      amountOutOfBin,
      feesTotal,
    } = EventDecoder.decodeSwap(event);

    price = getPriceFromId(activeId, binStep);
    swapForY = _swapForY;
    amountIn += amountInToBin;
    amountOut += amountOutOfBin;
    totalFees += feesTotal;
  });
  amountIn += totalFees;

  return {
    amountIn,
    amountOut,
    totalFees,
    swapForY,
    binId,
    price,
  };
};

/**
 * Decode liquidity events
 * @param events - string array starting with DEPOSITED_TO_BIN/WITHDRAWN_FROM_BIN
 * @returns
 */
export const decodeLiquidityEvents = (events: string[]) => {
  const [amountX, amountY] = events.reduce(
    ([sumX, sumY], event) => {
      const decoded = EventDecoder.decodeLiquidity(event);
      return [sumX + decoded.amountX, sumY + decoded.amountY];
    },
    [0n, 0n]
  );

  return {
    amountX,
    amountY,
  };
};
