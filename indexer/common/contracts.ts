if (
  !process.env.FACTORY_SC ||
  !process.env.DCA_SC ||
  !process.env.WMAS_SC ||
  !process.env.USDC_SC
) {
  throw new Error("Missing env variables");
}

export const factorySC = process.env.FACTORY_SC;
export const dcaSC = process.env.DCA_SC;

export const usdcSC = process.env.USDC_SC;
export const wmasSC = process.env.WMAS_SC;
