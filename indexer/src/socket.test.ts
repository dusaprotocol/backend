import { describe, it, expect, vi } from "vitest";
import * as Socket from "./socket";
import * as Methods from "../../common/methods";
import * as db from "./db";
import {
  IFactory,
  ILBPair,
  PairV2,
  REAL_ID_SHIFT,
  WBTC,
  parseUnits,
} from "@dusalabs/sdk";
import { binStep, inputToken, outputToken } from "./__tests__/placeholder";
import { web3Client } from "../../common/client";

// const spyToken = vi
//   .spyOn(Methods, "getTokenFromAddress")
//   .mockImplementation(() => Promise.resolve(WMAS));

describe("socket", () => {
  it("should process a swap", async () => {
    const spyCreateSwap = vi
      .spyOn(db, "createSwap")
      .mockImplementation(() => Promise.resolve());

    const tokenInAddress = inputToken.address;
    const tokenOutAddress = outputToken.address;
    const poolAddress = await Methods.fetchPairAddress(
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
      swapEvents: [],
      timestamp: new Date(),
    });

    // expect(spyToken).toHaveBeenCalledTimes(2);
    expect(spyCreateSwap).toHaveBeenCalledTimes(1);
  });
  it("should process a liquidity tx", async () => {
    const spyCreateLiquidity = vi
      .spyOn(db, "createLiquidity")
      .mockImplementation(() => Promise.resolve());

    const token0Address = inputToken.address;
    const token1Address = outputToken.address;
    const poolAddress = await Methods.fetchPairAddress(
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

describe("helpers", async () => {
  const poolAddress = await Methods.fetchPairAddress(
    outputToken.address,
    inputToken.address,
    binStep
  );
  const activeId = await new ILBPair(poolAddress, web3Client)
    .getReservesAndId()
    .then((res) => res.activeId);

  // const getOppositeBinId = (binId: number) => REAL_ID_SHIFT * 2 - binId;

  it("should calculate swap value correctly with MAS out", async () => {
    const tokenIn = inputToken; // USDC
    const tokenOut = outputToken; // WMAS
    const params: Parameters<typeof Socket.calculateSwapValue>["0"] = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      binStep,
      amountIn: parseUnits("1", tokenIn.decimals),
      feesIn: parseUnits("0.01", tokenIn.decimals),
      binId: activeId,
    };

    const { volume, fees, priceAdjusted } = await Socket.calculateSwapValue({
      ...params,
    });

    const [minVolume, maxVolume] = Methods.radius(1, 10);
    expect(volume).toBeGreaterThan(minVolume);
    expect(volume).toBeLessThan(maxVolume);

    const [minFees, maxFees] = Methods.radius(0.01, 10);
    expect(fees).toBeGreaterThan(minFees);
    expect(fees).toBeLessThan(maxFees);

    const [minPrice, maxPrice] = Methods.radius(0.2, 10);
    expect(priceAdjusted).toBeGreaterThan(minPrice);
    expect(priceAdjusted).toBeLessThan(maxPrice);
  });
  it("should calculate swap value correctly with MAS in", async () => {
    const tokenIn = outputToken; // MAS
    const tokenOut = inputToken; // USDC
    const params: Parameters<typeof Socket.calculateSwapValue>["0"] = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      binStep,
      amountIn: parseUnits("1", tokenIn.decimals),
      feesIn: parseUnits("0.01", tokenIn.decimals),
      binId: activeId,
    };

    const { volume, fees } = await Socket.calculateSwapValue(params);

    const [minVolume, maxVolume] = Methods.radius(5, 10);
    expect(volume).toBeGreaterThan(minVolume);
    expect(volume).toBeLessThan(maxVolume);

    const [minFees, maxFees] = Methods.radius(0.05, 10);
    expect(fees).toBeGreaterThan(minFees);
    expect(fees).toBeLessThan(maxFees);
  });
});
