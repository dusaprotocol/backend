import { describe, it, expect } from "vitest";
import {
  decodeLiquidityEvents,
  decodeLiquidityTx,
  decodeSwapEvents,
  decodeSwapTx,
} from "./decoder";
import { Args, ArrayTypes } from "@massalabs/massa-web3";
import { Address } from "@dusalabs/sdk";
import { WMAS, USDC } from "../../common/contracts";
import {
  swapParams,
  swapOptions,
  bestTrade,
  swapEvents,
  withdrawEvents,
  depositEvents,
} from "./__tests__/placeholder";
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
  const toSec = (ms: number) => Math.floor(ms / 1000);
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
    expect(toSec(decoded.deadline)).toStrictEqual(
      toSec(Date.now() + swapOptions.ttl)
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
  it("should decode without deserialization errors", () => {
    const arr = [
      53, 0, 0, 0, 65, 83, 49, 50, 100, 70, 83, 104, 75, 51, 86, 52, 106, 83,
      57, 78, 74, 65, 49, 49, 68, 109, 87, 89, 120, 50, 83, 69, 97, 55, 55, 51,
      54, 87, 52, 115, 71, 81, 76, 87, 89, 99, 66, 99, 55, 75, 106, 76, 69, 104,
      54, 66, 51, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 70, 72, 59, 70, 23, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      24, 0, 0, 0, 254, 28, 128, 0, 0, 0, 0, 0, 255, 28, 128, 0, 0, 0, 0, 0, 0,
      29, 128, 0, 0, 0, 0, 0, 96, 0, 0, 0, 85, 147, 180, 240, 1, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 168,
      217, 12, 103, 19, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 195, 182, 114, 241, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 52, 0, 0, 0, 65, 85,
      49, 99, 66, 105, 114, 84, 110, 111, 49, 70, 114, 77, 86, 112, 85, 77, 84,
      57, 54, 75, 105, 81, 57, 55, 119, 66, 113, 113, 77, 49, 122, 57, 117, 74,
      76, 114, 51, 88, 90, 75, 81, 119, 74, 106, 70, 76, 80, 69, 97, 114, 237,
      243, 137, 122, 140, 1, 0, 0,
    ];

    const fn = () =>
      decodeLiquidityTx(false, Uint8Array.from(arr), {
        mantissa: 0n,
        scale: 0,
      });

    expect(fn).not.toThrow();
  });
});
describe("event decoder", () => {
  it("should decode a simple swap", async () => {
    const decoded = decodeSwapEvents(swapEvents);

    expect(decoded.feesIn).toStrictEqual(283n * 3n);
    expect(decoded.amountIn).toStrictEqual(999717n * 3n + decoded.feesIn);
    expect(decoded.amountOut).toStrictEqual(199222843n * 3n);
    expect(decoded.binId).toStrictEqual(8391260);
  });
  it("should decode events for a simple add liquidity ", async () => {
    const decoded = decodeLiquidityEvents(depositEvents);

    expect(decoded.amountX).toStrictEqual(917501n * 3n);
    expect(decoded.amountY).toStrictEqual(4561880455n * 3n);
    expect(decoded.upperBound).toStrictEqual(8391260);
    expect(decoded.lowerBound).toStrictEqual(8391258);
  });
  it("should decode events for a simple remove liquidity MAS ", async () => {
    const decoded = decodeLiquidityEvents(withdrawEvents);

    expect(decoded.upperBound).toStrictEqual(8391259);
    expect(decoded.lowerBound).toStrictEqual(8391239);
  });
});
