import {
  ChainId,
  DCA_MANAGER_ADDRESS,
  LB_FACTORY_ADDRESS,
  USDC,
  WMAS,
} from "@dusalabs/sdk";

const chainId = ChainId.BUILDNET;

export const factorySC = LB_FACTORY_ADDRESS[chainId];
export const dcaSC = DCA_MANAGER_ADDRESS[chainId];

export const usdcSC = USDC[chainId].address;
export const wmasSC = WMAS[chainId].address;
