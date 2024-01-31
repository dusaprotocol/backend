import {
  DCA_MANAGER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_ROUTER_ADDRESS,
  LIMIT_ORDER_MANAGER_ADDRESS,
  USDC as _USDC,
  WMAS as _WMAS,
} from "@dusalabs/sdk";
import { CHAIN_ID } from "./config";

export const routerSC = LB_ROUTER_ADDRESS[CHAIN_ID];
export const factorySC = LB_FACTORY_ADDRESS[CHAIN_ID];
export const dcaSC = DCA_MANAGER_ADDRESS[CHAIN_ID];
export const orderSC = LIMIT_ORDER_MANAGER_ADDRESS[CHAIN_ID];

export const USDC = _USDC[CHAIN_ID];
export const WMAS = _WMAS[CHAIN_ID];
