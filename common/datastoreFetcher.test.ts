import { describe, it, expect, vi } from "vitest";
import { WETH as _WETH, WBTC as _WBTC, USDT as _USDT } from "@dusalabs/sdk";
import * as DF from "./datastoreFetcher";
import { prisma } from "./lib/__mocks__/prisma";
import { USDC, WMAS } from "./contracts";
import { CHAIN_ID } from "./config";

vi.mock("../../common/db");

describe("getTokenValue", () => {
  it("returns 1 for USDC", async () => {
    const value = await DF.getTokenValue(USDC);
    expect(value).toBe(1);
  });
  it("returns around 1 for USDT", async () => {
    const value = await DF.getTokenValue(_USDT[CHAIN_ID]);
    expect(value).toBeGreaterThan(0.99);
    expect(value).toBeLessThan(1.01);
  });
  it("returns around 5 for WMAS", async () => {
    const value = await DF.getTokenValue(WMAS);
    expect(value).toBeGreaterThan(4);
    expect(value).toBeLessThan(6);
  });
  it("returns around 2000 for WETH", async () => {
    const value = await DF.getTokenValue(_WETH[CHAIN_ID]);
    expect(value).toBeGreaterThan(2000);
    expect(value).toBeLessThan(4000);
  });
  it("returns around 30000 for WBTC", async () => {
    const value = await DF.getTokenValue(_WBTC[CHAIN_ID]);
    expect(value).toBeGreaterThan(30000);
    expect(value).toBeLessThan(50000);
  });
});
