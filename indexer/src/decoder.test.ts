import { describe, it, expect } from "vitest";
import { decodeLiquidityTx, decodeSwapTx } from "./decoder";
import { Args, ArrayTypes } from "@massalabs/massa-web3";
import {
  WMAS as _WMAS,
  USDC as _USDC,
  parseUnits,
  TokenAmount,
  QuoterHelper,
  Percent,
  Address,
} from "@dusalabs/sdk";
import { CHAIN_ID, web3Client } from "../../common/client";
import { ONE_MINUTE, convertMsToSec } from "../../common/utils";

describe("decoder", () => {
  it("should decode a simple swap", async () => {
    const WMAS = _WMAS[CHAIN_ID];
    const USDC = _USDC[CHAIN_ID];

    // Init: user inputs
    const inputToken = USDC;
    const outputToken = WMAS;
    const typedValueIn = "20"; // user string input
    const typedValueInParsed = parseUnits(
      typedValueIn,
      inputToken.decimals
    ).toString(); // returns 20000000
    const amountIn = new TokenAmount(inputToken, typedValueInParsed); // wrap into TokenAmount

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
    const params = bestTrade.swapCallParameters({
      ttl: ONE_MINUTE * 10, // 10 minutes
      recipient: "",
      allowedSlippage: new Percent("5"),
    });

    const decoded = decodeSwapTx(
      "swapExactTokensForTokens",
      Uint8Array.from(params.args.serialize()),
      undefined
    );

    expect(decoded.amountIn).toStrictEqual(BigInt(typedValueInParsed));
    expect(decoded.path).toStrictEqual([
      new Address(USDC.address),
      new Address(WMAS.address),
    ]);
    expect(convertMsToSec(decoded.deadline)).toStrictEqual(
      convertMsToSec(Date.now() + ONE_MINUTE * 10)
    );
    expect(decoded.to).toStrictEqual("");
  });
  it("should decode a simple addLiquidity", async () => {
    const WMAS = _WMAS[CHAIN_ID];
    const USDC = _USDC[CHAIN_ID];

    // Init: user inputs
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

    const decoded = decodeLiquidityTx(true, Uint8Array.from(params), undefined);

    expect("amount0" in decoded).toStrictEqual(true);
    if (!("amount0" in decoded)) throw new Error("amount0 not found");
    expect(decoded.amount0).toStrictEqual(amount0);
    expect(decoded.amount1).toStrictEqual(amount1);
    expect(decoded.amount0Min).toStrictEqual(amount0Min);
    expect(decoded.deadline).toStrictEqual(1);
    expect(decoded.to).toStrictEqual("");
  });
  it("should decode a simple removeLiquidity", async () => {
    const WMAS = _WMAS[CHAIN_ID];
    const USDC = _USDC[CHAIN_ID];

    // Init: user inputs
    const inputToken = USDC;
    const outputToken = WMAS;
    const binStep = 20;
    const amount0Min = 1n;
    const amount1Min = 1n;
    const ids = [1n];
    const amounts = [1n];
    const to = "";
    const deadline = 1;

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
