import { Percent, QuoterHelper, TokenAmount, parseUnits } from "@dusalabs/sdk";
import { WMAS, USDC } from "../../../common/contracts";
import { web3Client, CHAIN_ID } from "../../../common/client";
import { ONE_MINUTE } from "../../../common/utils";

export const inputToken = USDC;
export const outputToken = WMAS;
export const binStep = 20;
export const typedValueInParsed = parseUnits(
  "20",
  inputToken.decimals
).toString();
export const amountIn = new TokenAmount(inputToken, typedValueInParsed);

export const bestTrade = await QuoterHelper.findBestPath(
  inputToken,
  false,
  outputToken,
  true,
  amountIn,
  true,
  3,
  web3Client,
  CHAIN_ID
);
export const swapOptions = {
  ttl: ONE_MINUTE * 10,
  recipient: "",
  allowedSlippage: new Percent(1n, 100n),
};
export const swapParams = bestTrade.swapCallParameters(swapOptions);
