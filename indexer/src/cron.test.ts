import { describe, it, expect } from "vitest";
import { calculateUSDLocked } from "./crons";
import { radius } from "../../common/methods";
import { USDC, WMAS } from "../../common/contracts";
import { WETH as _WETH, parseUnits } from "@dusalabs/sdk";

describe("cron", () => {
  it("calculateUSDLocked", async () => {
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
});
