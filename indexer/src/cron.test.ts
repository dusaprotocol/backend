import { describe, expect, test } from "vitest";
import { fetchNewAnalytics } from "./crons";
import { fetchPairAddress, radius } from "../../common/methods";
import { WMAS } from "../../common/contracts";
import { WETH as _WETH } from "@dusalabs/sdk";
import { CHAIN_ID } from "../../common/client";

describe("fetchNewAnalytics", () => {
  test("returns undefined", async () => {
    const binStep = 15;
    const pairAddress = await fetchPairAddress(
      WMAS.address,
      _WETH[CHAIN_ID].address,
      binStep
    );
    if (!pairAddress) throw new Error("Pair address not found");
    const res = await fetchNewAnalytics(pairAddress, binStep);
    if (!res) throw new Error("Result not found");
    const value = res.adjustedPrice;

    const [min, max] = radius(1 / 350, 25);
    expect(value).toBeGreaterThan(min);
    expect(value).toBeLessThan(max);
  });
});
