import { describe, it, expect, vi } from "vitest";
import * as Socket from "../socket";
import * as Methods from "../../../common/methods";
import * as DF from "../../../common/datastoreFetcher";
import * as db from "../db";
import {
  IFactory,
  ILBPair,
  PairV2,
  REAL_ID_SHIFT,
  WBTC,
  parseUnits,
} from "@dusalabs/sdk";
import { binStep, inputToken, outputToken, swapEvents } from "./placeholder";
import { web3Client } from "../../../common/client";

// const spyToken = vi
//   .spyOn(Methods, "getTokenFromAddress")
//   .mockImplementation(() => Promise.resolve(WMAS));

describe("socket", () => {
  it("should process a swap", async () => {
    const spyCreateSwap = vi
      .spyOn(db, "createSwap")
      .mockImplementation(() => Promise.resolve(true));

    const tokenInAddress = inputToken.address;
    const tokenOutAddress = outputToken.address;
    const poolAddress = await DF.fetchPairAddress(
      tokenInAddress,
      tokenOutAddress,
      binStep
    );

    await Socket.processSwap({
      txHash: "",
      indexInSlot: 1,
      userAddress: "",
      tokenInAddress,
      tokenOutAddress,
      binStep,
      poolAddress,
      swapEvents: swapEvents,
      timestamp: new Date(),
    });

    // expect(spyToken).toHaveBeenCalledTimes(2);
    expect(spyCreateSwap).toHaveBeenCalledTimes(1);
  });
  it("should process a liquidity tx", async () => {
    const spyCreateLiquidity = vi
      .spyOn(db, "createLiquidity")
      .mockImplementation(() => Promise.resolve(true));

    const token0Address = inputToken.address;
    const token1Address = outputToken.address;
    const poolAddress = await DF.fetchPairAddress(
      token0Address,
      token1Address,
      binStep
    );

    await Socket.processLiquidity({
      txHash: "",
      userAddress: "",
      token0Address,
      token1Address,
      poolAddress,
      liqEvents: [],
      timestamp: new Date(),
      isAdd: true,
    });

    expect(spyCreateLiquidity).toHaveBeenCalledTimes(1);
    // expect(spyToken).toHaveBeenCalledTimes(2);
  });
});

describe("calculateSwapValue", async () => {
  it("should calculate swap value correctly with MAS out", async () => {
    const tokenIn = inputToken; // USDC
    const tokenOut = outputToken; // WMAS
    const valueIn = 1;
    const params: Parameters<typeof Socket.calculateSwapValue>["0"] = {
      tokenIn: tokenIn,
      valueIn,
      amountIn: parseUnits("1", tokenIn.decimals),
      feesIn: parseUnits("0.01", tokenIn.decimals),
    };

    const { volume, fees } = Socket.calculateSwapValue({
      ...params,
    });

    expect(volume).toStrictEqual(1);
    expect(fees).toStrictEqual(0.01);
  });
  it("should calculate swap value correctly with MAS in", async () => {
    const tokenIn = outputToken; // MAS
    const tokenOut = inputToken; // USDC
    const valueIn = 5;
    const params: Parameters<typeof Socket.calculateSwapValue>["0"] = {
      tokenIn: tokenIn,
      valueIn,
      amountIn: parseUnits("1", tokenIn.decimals),
      feesIn: parseUnits("0.01", tokenIn.decimals),
    };

    const { volume, fees } = Socket.calculateSwapValue(params);

    expect(volume).toStrictEqual(5);
    expect(fees).toStrictEqual(0.05);
  });
});
