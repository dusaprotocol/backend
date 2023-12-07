import { describe, it, expect, vi } from "vitest";
import * as Socket from "./socket";
import { USDC, WMAS } from "../../common/contracts";
import * as Methods from "../../common/methods";
import * as db from "./db";

describe("socket", () => {
  it("should process a swap", async () => {
    const spyCreateSwap = vi
      .spyOn(db, "createSwap")
      .mockImplementation(() => Promise.resolve());
    const spy2 = vi
      .spyOn(db, "updateVolumeAndPrice")
      .mockImplementation(() => Promise.resolve());
    const spyToken = vi
      .spyOn(Methods, "getTokenFromAddress")
      .mockImplementation(() => Promise.resolve(WMAS));

    const tokenInAddress = USDC.address;
    const tokenOutAddress = WMAS.address;
    const binStep = 20;
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

    expect(spyToken).toHaveBeenCalledTimes(2);
    expect(spy2).toHaveBeenCalledTimes(1);
    expect(spyCreateSwap).toHaveBeenCalledTimes(1);
  });
  it("should process a liquidity tx", async () => {
    const spyCreateSwap = vi
      .spyOn(db, "createLiquidity")
      .mockImplementation(() => Promise.resolve());
    const spyToken = vi
      .spyOn(Methods, "getTokenFromAddress")
      .mockImplementation(() => Promise.resolve(WMAS));

    const token0Address = USDC.address;
    const token1Address = WMAS.address;
    const binStep = 20;
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

    expect(spyCreateSwap).toHaveBeenCalledTimes(1);
    expect(spyToken).toHaveBeenCalledTimes(2);
  });
});
