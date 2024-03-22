import {
  DCA_MANAGER_ADDRESS,
  LB_FACTORY_ADDRESS,
  LB_ROUTER_ADDRESS,
  LIMIT_ORDER_MANAGER_ADDRESS,
  USDC as _USDC,
  WMAS as _WMAS,
  USDT as _USDT,
  WETH as _WETH,
  WBTC as _WBTC,
} from "@dusalabs/sdk";
import { CHAIN_ID } from "./config";
import { web3Client } from "./client";
import { strToBytes, bytesToStr } from "@massalabs/massa-web3";

export const routerSC = LB_ROUTER_ADDRESS[CHAIN_ID];
export const factorySC = LB_FACTORY_ADDRESS[CHAIN_ID];
export const dcaSC = DCA_MANAGER_ADDRESS[CHAIN_ID];
export const orderSC = LIMIT_ORDER_MANAGER_ADDRESS[CHAIN_ID];
export const CORE = [routerSC, factorySC];

export const USDC = _USDC[CHAIN_ID];
export const WMAS = _WMAS[CHAIN_ID];
export const USDT = _USDT[CHAIN_ID];
export const WETH = _WETH[CHAIN_ID];
export const WBTC = _WBTC[CHAIN_ID];
export const TOKENS = [
  USDC.address,
  WMAS.address,
  USDT.address,
  WETH.address,
  WBTC.address,
];

export const PAIRS = await web3Client
  .publicApi()
  .getDatastoreEntries([{ address: factorySC, key: strToBytes("ALL_PAIRS") }])
  .then(async (res) => {
    const bs = res[0].final_value;
    if (!bs) return [];

    return bytesToStr(bs)
      .split(":")
      .filter((s) => s);
  })
  .catch(() => [] as string[]);

export const ADDRESSES = [...CORE, ...TOKENS, ...PAIRS];
