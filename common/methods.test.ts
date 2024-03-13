import { IEvent } from "@massalabs/massa-web3";
import * as Methods from "./methods";
import { WETH as _WETH, WBTC as _WBTC, USDT as _USDT } from "@dusalabs/sdk";
import { describe, expect, it } from "vitest";
import {
  swapEvents,
  withdrawEvents,
} from "../indexer/src/__tests__/placeholder";
import { ONE_DAY, getDailyTick } from "./utils";

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

    expect(Methods.isLiquidityEvent(event, poolAddress)).toBe(true);
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

    expect(Methods.isLiquidityEvent(event, poolAddress)).toBe(true);
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

    expect(Methods.isLiquidityEvent(event, poolAddress)).toBe(false);
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
  const params: Parameters<typeof Methods.calculateStreak>["0"] = [];
  const now = getDailyTick().getTime();

  it("returns 0 for a single record two weeks ago", () => {
    const p1 = { ...p, date: new Date(now - ONE_DAY * 14) };
    expect(Methods.calculateStreak([p1])).toBe(0);
  });
  it("returns 1 for a single record last week", () => {
    const p1 = { ...p, date: new Date(now - ONE_DAY * 7) };
    expect(Methods.calculateStreak([p1])).toBe(1);
  });
  it("returns 1 for two records in the same week", () => {
    const p1 = {
      ...p,
      date: new Date(now - ONE_DAY * 2),
    };
    const p2 = {
      ...p,
      date: new Date(now - ONE_DAY * 4),
    };
    expect(Methods.calculateStreak([p1, p2])).toBe(1);
  });
});
