import { Args, ArrayTypes } from "@massalabs/massa-web3";
import {
  AddLiquidityParameters,
  Address,
  ChainId,
  LiquidityParameters,
  RemoveLiquidityParameters,
  Token,
  TokenAmount,
} from "@dusalabs/sdk";
import { fetchTokenInfo } from "../../common/methods";
import { CHAIN_ID } from "../../common/client";

export interface SwapParams {
  amountIn: bigint;
  amountOut: bigint;
  binSteps: bigint[];
  path: Address[];
  to: string;
  deadline: bigint;
}

const extractAmountInOut = (method: string, args: Args) => {
  switch (method) {
    case "swapExactTokensForTokens": {
      const amountIn = args.nextU64();
      const amountOutMin = args.nextU64();
      return { amountIn, amountOut: amountOutMin };
    }
    case "swapTokensForExactTokens": {
      const amountOut = args.nextU64();
      const amountInMax = args.nextU64();
      return { amountIn: amountInMax, amountOut };
    }
    default: {
      throw new Error("unknown method");
    }
  }
};

export const decodeSwapTx = async (
  method: string,
  params: Uint8Array | undefined
): Promise<SwapParams | undefined> => {
  try {
    const args = new Args(params);
    const { amountIn, amountOut } = extractAmountInOut(method, args);

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

// type DecodedLiquidity = AddLiquidityParameters | RemoveLiquidityParameters
type DecodedLiquidity = Pick<
  AddLiquidityParameters,
  "token0" | "token1" | "binStep"
>;

export const decodeLiquidityTx = async (
  isAdd: boolean,
  params: Uint8Array | undefined
): Promise<DecodedLiquidity | undefined> => {
  try {
    const args = new Args(params);
    const token0 = args.nextString();
    const token1 = args.nextString();
    const binStep = args.nextU32();

    if (isAdd) {
      const amount0 = args.nextU64();
      const amount1 = args.nextU64();
      const amount0Min = args.nextU64();
      const amount1Min = args.nextU64();
      const activeIdDesired = args.nextU64();
      const idSlippage = args.nextU64();
      const deltaIds = args.nextArray<number>(ArrayTypes.I64);
      const distribution0 = args.nextArray<number>(ArrayTypes.U64);
      const distribution1 = args.nextArray<number>(ArrayTypes.U64);
      const to = args.nextString();
      const deadline = Number(args.nextU64());
    } else {
      const amount0Min = args.nextU64();
      const amount1Min = args.nextU64();
      const ids = args.nextArray<number>(ArrayTypes.U64);
      const amounts = args.nextArray<bigint>(ArrayTypes.U64);
      const to = args.nextString();
      const deadline = Number(args.nextU64());

      return {
        token0,
        token1,
        binStep,
      };
    }
  } catch (e) {
    console.log(e);
  }
};

const toLog = async (params: SwapParams) => {
  const tokenInAddress = params.path[0].str;
  const tokenOutAddress = params.path[params.path.length - 1].str;
  const tokenIn = await fetchTokenInfo(tokenInAddress);
  const tokenOut = await fetchTokenInfo(tokenOutAddress);
  if (!tokenIn || !tokenOut) return;

  const parsedAmountIn = new TokenAmount(
    new Token(CHAIN_ID, tokenInAddress, tokenIn.decimals),
    params.amountIn
  );
  const parsedAmountOut = new TokenAmount(
    new Token(CHAIN_ID, tokenOutAddress, tokenOut.decimals),
    params.amountOut
  );

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
