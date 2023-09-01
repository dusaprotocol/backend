import {
  ChainId,
  DCA_MANAGER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_ROUTER_ADDRESS,
  USDC,
  WMAS,
} from "@dusalabs/sdk";

const chainId = ChainId.BUILDNET;

export const routerSC = LB_ROUTER_ADDRESS[chainId];
export const factorySC = LB_FACTORY_ADDRESS[chainId];
export const dcaSC = DCA_MANAGER_ADDRESS[chainId];

export const usdcSC = USDC[chainId].address;
export const wmasSC = WMAS[chainId].address;
