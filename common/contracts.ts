import {
  ChainId,
  DCA_MANAGER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_ROUTER_ADDRESS,
  USDC,
  WMAS,
} from "@dusalabs/sdk";
import { CHAIN_ID } from "./client";

export const routerSC = LB_ROUTER_ADDRESS[CHAIN_ID];
export const factorySC = LB_FACTORY_ADDRESS[CHAIN_ID];
export const dcaSC = DCA_MANAGER_ADDRESS[CHAIN_ID];

export const usdcSC = USDC[CHAIN_ID].address;
export const wmasSC = WMAS[CHAIN_ID].address;
