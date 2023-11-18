import { CHAIN_ID } from "./client";
import { USDC, WMAS } from "./contracts";
import { getTokenValue } from "./methods";
import { WETH as _WETH } from "@dusalabs/sdk";
import { describe, expect, test } from "vitest";

describe("getTokenValue", () => {
  test("returns 1 for USDC", async () => {
    const value = await getTokenValue(USDC.address);
    expect(value).toBe(1);
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
});

const radius = (x: number, pct: number): [number, number] => [
  x - (x * pct) / 100,
  x + (x * pct) / 100,
];
