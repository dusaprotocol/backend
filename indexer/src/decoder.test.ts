import { describe, it, expect } from "vitest";
import {
  decodeLiquidityEvents,
  decodeLiquidityTx,
  decodeSwapEvents,
  decodeSwapTx,
} from "./decoder";
import { Args, ArrayTypes } from "@massalabs/massa-web3";
import { Address } from "@dusalabs/sdk";
import { CHAIN_ID, web3Client } from "../../common/client";
import { ONE_MINUTE, convertMsToSec } from "../../common/utils";
import { WMAS, USDC } from "../../common/contracts";
import { swapParams, swapOptions, bestTrade } from "./__tests__/placeholder";
import { NativeAmount } from "../gen/ts/massa/model/v1/amount";

const inputToken = USDC;
const outputToken = WMAS;
const binStep = 20;
const amount0 = 1n;
const amount1 = 1n;
const amount0Min = 1n;
const amount1Min = 1n;
const activeIdDesired = 1;
const idSlippage = 1;
const deltaIds = [1n];
const distribution0 = [1n];
const distribution1 = [1n];
const to = "";
const deadline = 1;

const params = new Args()
  .addString(inputToken.address)
  .addString(outputToken.address)
  .addU32(binStep)
  .addU256(amount0)
  .addU256(amount1)
  .addU256(amount0Min)
  .addU256(amount1Min)
  .addU64(BigInt(activeIdDesired))
  .addU64(BigInt(idSlippage))
  .addArray(deltaIds, ArrayTypes.I64)
  .addArray(distribution0, ArrayTypes.U256)
  .addArray(distribution1, ArrayTypes.U256)
  .addString(to)
  .addU64(BigInt(deadline))
  .serialize();

describe("tx decoder", () => {
  it("should decode a simple swap", async () => {
    const decoded = decodeSwapTx(
      "swapExactTokensForTokens",
      Uint8Array.from(swapParams.args.serialize()),
      undefined
    );

    expect(decoded.amountIn).toStrictEqual(bestTrade.inputAmount.raw);
    expect(decoded.binSteps).toStrictEqual(bestTrade.quote.binSteps);
    expect(decoded.path).toStrictEqual(
      bestTrade.route.pathToStrArr().map((str) => new Address(str))
    );
    expect(convertMsToSec(decoded.deadline)).toStrictEqual(
      convertMsToSec(Date.now() + swapOptions.ttl)
    );
    expect(decoded.to).toStrictEqual(swapOptions.recipient);
  });
  it("should decode a simple addLiquidity", async () => {
    const decoded = decodeLiquidityTx(true, Uint8Array.from(params), undefined);

    expect("amount0" in decoded).toStrictEqual(true);
    if (!("amount0" in decoded)) throw new Error("amount0 not found");
    expect(decoded.amount0).toStrictEqual(amount0);
    expect(decoded.amount1).toStrictEqual(amount1);
    expect(decoded.amount0Min).toStrictEqual(amount0Min);
  });
  it("should decode a simple removeLiquidity", async () => {
    const ids = [1n];
    const amounts = [1n];

    const params = new Args()
      .addString(inputToken.address)
      .addString(outputToken.address)
      .addU32(binStep)
      .addU256(amount0Min)
      .addU256(amount1Min)
      .addArray(ids, ArrayTypes.I64)
      .addArray(amounts, ArrayTypes.U256)
      .addString(to)
      .addU64(BigInt(deadline))
      .serialize();

    const decoded = decodeLiquidityTx(
      false,
      Uint8Array.from(params),
      undefined
    );

    expect("amount0" in decoded).toStrictEqual(false);
    if ("amount0" in decoded) throw new Error("amount0 found");
    expect(decoded.amount0Min).toStrictEqual(amount0Min);
    expect(decoded.amount1Min).toStrictEqual(amount1Min);
    expect(decoded.amount0Min).toStrictEqual(amount0Min);
    expect(decoded.deadline).toStrictEqual(1);
    expect(decoded.to).toStrictEqual("");
  });
});
describe("event decoder", () => {
  it("should decode a simple swap", async () => {
    const swapEvents = [
      "SWAP:AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar,8391258,true,䄥\x0F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,௟\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,0,ě\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
      "SWAP:AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar,8391259,true,䄥\x0F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,௟\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,0,ě\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
      "SWAP:AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar,8391260,true,䄥\x0F\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,௟\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,0,ě\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
    ];

    const decoded = decodeSwapEvents(swapEvents);

    expect(decoded.totalFees).toStrictEqual(283n * 3n);
    expect(decoded.amountIn).toStrictEqual(999717n * 3n + decoded.totalFees);
    expect(decoded.amountOut).toStrictEqual(199222843n * 3n);
    expect(decoded.binId).toStrictEqual(8391260);
  });
  it("should decode a simple liquidity", async () => {
    const liqEvents = [
      "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX,8391258,�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000,얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
      "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX,8391259,�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000,얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
      "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX,8391260,�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000,얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
    ];

    const decoded = decodeLiquidityEvents(liqEvents);

    expect(decoded.amountX).toStrictEqual(917501n * 3n);
    expect(decoded.amountY).toStrictEqual(4561880455n * 3n);
    expect(decoded.upperBound).toStrictEqual(8391260);
    expect(decoded.lowerBound).toStrictEqual(8391258);
  });
});
