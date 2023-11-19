import { CHAIN_ID } from "./client";
import { USDC, WMAS } from "./contracts";
import { getTokenValue, radius } from "./methods";
import { WETH as _WETH, WBTC as _WBTC, USDT as _USDT } from "@dusalabs/sdk";
import { describe, expect, test } from "vitest";

describe("getTokenValue", () => {
  test("returns 1 for USDC", async () => {
    const value = await getTokenValue(USDC.address);
    expect(value).toBe(1);
  });
  test("returns around 1 for USDT", async () => {
    const value = await getTokenValue(_USDT[CHAIN_ID].address);
    const [min, max] = radius(1, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  test("returns around 5 for WMAS", async () => {
    const value = await getTokenValue(WMAS.address);
    const [min, max] = radius(5, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  test("returns around 2000 for WETH", async () => {
    const value = await getTokenValue(_WETH[CHAIN_ID].address);
    const [min, max] = radius(2000, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  test("returns around 30000 for WBTC", async () => {
    const value = await getTokenValue(_WBTC[CHAIN_ID].address);
    const [min, max] = radius(30000, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
});
