import { describe, expect, test } from "vitest";
import { calculateUSDLocked, fetchNewAnalytics } from "./crons";
import { fetchPairAddress, radius } from "../../common/methods";
import { USDC, WMAS } from "../../common/contracts";
import { WETH as _WETH, parseUnits } from "@dusalabs/sdk";

describe("cron", () => {
  test("calculateUSDLocked", async () => {
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
