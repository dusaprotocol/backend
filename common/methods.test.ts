import { IEvent } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./client";
import { USDC, WMAS } from "./contracts";
import {
  getTokenValue,
  isLiquidityEvent,
  isSwapEvent,
  radius,
} from "./methods";
import { WETH as _WETH, WBTC as _WBTC, USDT as _USDT } from "@dusalabs/sdk";
import { describe, expect, it } from "vitest";

describe("getTokenValue", () => {
  it("returns 1 for USDC", async () => {
    const value = await getTokenValue(USDC);
    expect(value).toBe(1);
  });
  it("returns around 1 for USDT", async () => {
    const value = await getTokenValue(_USDT[CHAIN_ID]);
    const [min, max] = radius(1, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  it("returns around 5 for WMAS", async () => {
    const value = await getTokenValue(WMAS);
    const [min, max] = radius(5, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  it("returns around 2000 for WETH", async () => {
    const value = await getTokenValue(_WETH[CHAIN_ID]);
    const [min, max] = radius(2000, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  it("returns around 30000 for WBTC", async () => {
    const value = await getTokenValue(_WBTC[CHAIN_ID]);
    const [min, max] = radius(30000, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
});
describe("isEvent", () => {
  let x: IEvent["context"];
  const context: typeof x = {} as any;
  it("returns true for remove liquidity event", () => {
    const poolAddress = "0x";
    const event: IEvent = {
      context: {
        ...context,
        call_stack: [poolAddress],
      },
      data: "WITHDRAWN_FROM_BIN:AS1YqRd4gDMaJ1Udkd1TsMFXEhAbaRoQvMURPgHYs9w8zc1egrNQ,8391236,̸\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00,ŏ\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00",
    };

    expect(isLiquidityEvent(event, poolAddress)).toBe(true);
  });
});
