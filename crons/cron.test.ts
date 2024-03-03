import { describe, it, expect } from "vitest";
import { calculateUSDLocked, radius, toToken } from "../common/methods";
import { USDC, WMAS } from "../common/contracts";
import { WETH as _WETH, parseUnits } from "@dusalabs/sdk";

describe("calculateUSDLocked", () => {
  it("handle valid pool", async () => {
    const value = await calculateUSDLocked(
      WMAS,
      parseUnits("1", WMAS.decimals),
      USDC,
      parseUnits("1", USDC.decimals)
    );

    const [min, max] = radius(6, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
  it("handle invalid pool", async () => {
    const oldToken = toToken({
      address: "AS123aZ3ZbYcTG5qt6YzTQZyZLaqkWtmJyT8EL2kjsZS8gbnXTTeY",
      decimals: 6,
    });
    const value = await calculateUSDLocked(
      WMAS,
      parseUnits("1", WMAS.decimals),
      oldToken,
      parseUnits("1", oldToken.decimals)
    );

    const [min, max] = radius(6, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
});
