import { Percent, QuoterHelper, TokenAmount, parseUnits } from "@dusalabs/sdk";
import { WMAS, USDC } from "../../../common/contracts";
import { CHAIN_ID } from "../../../common/config";
import { web3Client } from "../../../common/client";
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
export const swapEvents = [
  "SWAP:AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar;?!8391258;?!true;?!䄥\x0F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!௟\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!0;?!ě\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
  "SWAP:AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar;?!8391259;?!true;?!䄥\x0F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!௟\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!0;?!ě\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
  "SWAP:AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar;?!8391260;?!true;?!䄥\x0F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!௟\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!0;?!ě\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
];

export const depositEvents = [
  "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX;?!8391258;?!�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000;?!얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
  "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX;?!8391259;?!�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000;?!얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
  "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX;?!8391260;?!�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000;?!얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
];
export const withdrawEvents = [
  "WITHDRAWN_FROM_BIN:AS1YqRd4gDMaJ1Udkd1TsMFXEhAbaRoQvMURPgHYs9w8zc1egrNQ;?!8391239;?!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!�ٌ\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
  "WITHDRAWN_FROM_BIN:AS1YqRd4gDMaJ1Udkd1TsMFXEhAbaRoQvMURPgHYs9w8zc1egrNQ;?!8391245;?!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!ᆤِ\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
  "WITHDRAWN_FROM_BIN:AS1YqRd4gDMaJ1Udkd1TsMFXEhAbaRoQvMURPgHYs9w8zc1egrNQ;?!8391259;?!債捗\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00;?!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
];
