import { Percent, QuoterHelper, TokenAmount, parseUnits } from "@dusalabs/sdk";
import { WMAS, USDC } from "../../../common/contracts";
import { web3Client, CHAIN_ID } from "../../../common/client";
import { ONE_MINUTE } from "../../../common/utils";

const inputToken = USDC;
const outputToken = WMAS;
const typedValueInParsed = parseUnits("20", inputToken.decimals).toString();
const amountIn = new TokenAmount(inputToken, typedValueInParsed);

const bestTrade = await QuoterHelper.findBestPath(
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
const swapOptions = {
  ttl: ONE_MINUTE * 10,
  recipient: "",
  allowedSlippage: new Percent(1n, 100n),
};
const swapParams = bestTrade.swapCallParameters(swapOptions);

export { swapParams, swapOptions, bestTrade };
