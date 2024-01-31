import { describe, it, expect } from "vitest";
import { calculateUSDLocked, radius } from "../common/methods";
import { USDC, WMAS } from "../common/contracts";
import { Token, WETH as _WETH, parseUnits } from "@dusalabs/sdk";
import { CHAIN_ID } from "../common/config";

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
    const oldToken = new Token(
      CHAIN_ID,
      "AS123aZ3ZbYcTG5qt6YzTQZyZLaqkWtmJyT8EL2kjsZS8gbnXTTeY",
      6
    );
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
