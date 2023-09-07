import { Args, ArrayTypes } from "@massalabs/massa-web3";
import { Address, ChainId, Token, TokenAmount } from "@dusalabs/sdk";
import { fetchTokenInfo } from "../../common/methods";

export const decodeSwapTx = async (
  method: string,
  params: Uint8Array | undefined
) => {
  try {
    const args = new Args(params);
    switch (method) {
      case "swapExactTokensForTokens": {
        const amountIn = args.nextU64();
        const amountOutMin = args.nextU64();
        const binSteps = args.nextArray(ArrayTypes.U64) as bigint[];
        const path = args.nextSerializableObjectArray(Address);
        const to = args.nextString();
        const deadline = args.nextU64();
        await toLog(
          method,
          amountIn,
          amountOutMin,
          binSteps,
          path,
          to,
          deadline
        ).then(console.log);
        break;
      }
      case "swapTokensForExactTokens": {
        const amountOut = args.nextU64();
        const amountInMax = args.nextU64();
        const binSteps: bigint[] = args.nextArray(ArrayTypes.U64) as bigint[];
        const path = args.nextSerializableObjectArray(Address);
        const to = args.nextString();
        const deadline = args.nextU64();
        await toLog(
          method,
          amountInMax,
          amountOut,
          binSteps,
          path,
          to,
          deadline
        ).then(console.log);
        break;
      }
      default: {
        console.log("unknown method");
      }
    }
  } catch (e) {
    console.log(e);
  }
};

const toLog = async (
  method: string,
  amountIn: bigint,
  amountOut: bigint,
  binSteps: bigint[],
  path: Address[],
  to: string,
  deadline: bigint
) => {
  const CHAIN_ID = ChainId.BUILDNET;
  const tokenInAddress = path[0].str;
  const tokenOutAddress = path[path.length - 1].str;
  const tokenIn = await fetchTokenInfo(tokenInAddress);
  const tokenOut = await fetchTokenInfo(tokenOutAddress);
  if (!tokenIn || !tokenOut) return;
  // const tokenIn = new Token(CHAIN_ID, fetchTokenInfo(path[0].str))
  const parsedAmountIn = new TokenAmount(
    new Token(
      CHAIN_ID,
      tokenInAddress,
      tokenIn.decimals,
      tokenIn.symbol,
      tokenIn.name
    ),
    amountIn
  );
  const parsedAmountOut = new TokenAmount(
    new Token(
      CHAIN_ID,
      tokenOutAddress,
      tokenOut.decimals,
      tokenOut.symbol,
      tokenOut.name
    ),
    amountOut
  );

  return {
    route: path.map((token) => `${token.str}`).join(", "),
    inputAmount: `${parsedAmountIn.toSignificant(6)} ${
      parsedAmountIn.currency.symbol
    }`,
    outputAmount: `${parsedAmountOut.toSignificant(6)} ${
      parsedAmountOut.currency.symbol
    }`,
  };
};
