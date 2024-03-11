import { IEvent } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./config";
import { USDC, WMAS } from "./contracts";
import { calculateStreak, isLiquidityEvent, radius } from "./methods";
import { WETH as _WETH, WBTC as _WBTC, USDT as _USDT } from "@dusalabs/sdk";
import { describe, expect, it } from "vitest";
import {
  swapEvents,
  withdrawEvents,
} from "../indexer/src/__tests__/placeholder";
import { ONE_DAY } from "./utils";
import { getTokenValue } from "./datastoreFetcher";

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
      data: withdrawEvents[0],
    };

    expect(isLiquidityEvent(event, poolAddress)).toBe(true);
  });
  it("returns true for add liquidity event", () => {
    const poolAddress = "0x";
    const event: IEvent = {
      context: {
        ...context,
        call_stack: [poolAddress],
      },
      data: "DEPOSITED_TO_BIN:AU1Rtd4BFRN8syiGigCwruJMtMhHWebvBqnYFyPDc3SVctnJqvYX,8391258,�\r\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000,얇࿨\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000",
    };

    expect(isLiquidityEvent(event, poolAddress)).toBe(true);
  });
  it("returns true for remove liquidity event", () => {
    const poolAddress = "0x";
    const event: IEvent = {
      context: {
        ...context,
        call_stack: [poolAddress],
      },
      data: swapEvents[0],
    };

    expect(isLiquidityEvent(event, poolAddress)).toBe(false);
  });
});
describe("calculateStreak", () => {
  const address = "AU1cBirTno1FrMVpUMT96KiQ97wBqqM1z9uJLr3XZKQwJjFLPEar";
  const poolAddress = "AS12mcVCcziH2e3YVXqWzDG6nR8RBQ4FKh8HnZkGGGnh7JuqwUXa";
  const volume = 1;
  const accruedFeesUsd = 1;
  const accruedFeesL = "0";
  const accruedFeesX = "0";
  const accruedFeesY = "0";
  const p = {
    address,
    poolAddress,
    volume,
    accruedFeesUsd,
    accruedFeesL,
    accruedFeesX,
    accruedFeesY,
  };
  const params: Parameters<typeof calculateStreak>["0"] = [];

  it("returns 1 for a single record today", () => {
    const p1 = {
      ...p,
      date: new Date(),
    };
    expect(calculateStreak([...params, p1])).toBe(1);
  });
  it("returns 0 for a single record one week ago", () => {
    const p1 = { ...p, date: new Date(Date.now() - ONE_DAY * 7) };
    expect(calculateStreak([...params, p1])).toBe(0);
  });
  it("returns 2 for a two records separated by two days", () => {
    const p1 = {
      ...p,
      date: new Date(Date.now() - ONE_DAY * 2),
    };
    const p2 = {
      ...p,
      date: new Date(Date.now() - ONE_DAY * 4),
    };
    expect(calculateStreak([...params, p1, p2])).toBe(2);
  });
});
