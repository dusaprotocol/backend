import { strToBytes, bytesToStr, Args } from "@massalabs/massa-web3";
import { web3Client } from "./client";
import { USDC, WMAS, dcaSC, factorySC } from "./contracts";
import {
  IERC20,
  IFactory,
  QuoterHelper,
  Token,
  TokenAmount,
  parseUnits,
} from "@dusalabs/sdk";
import { CHAIN_ID } from "./config";
import { toToken } from "./methods";
import { DCA, Status } from "@prisma/client";
import { decodeDcaTx } from "../indexer/src/decoder";

export const fetchPairAddress = async (
  token0: string,
  token1: string,
  binStep: number
): Promise<string> =>
  new IFactory(factorySC, web3Client)
    .getLBPairInformation(token0, token1, binStep)
    .then((res) => res.LBPair);

export const getBinStep = (pairAddress: string): Promise<number> =>
  web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: pairAddress,
        key: strToBytes("FEES_PARAMETERS"),
      },
    ])
    .then((entries) => {
      if (!entries[0].final_value) throw new Error("No binStep found");

      const args = new Args(entries[0].final_value);
      const binStep = args.nextU32();
      return binStep;
    });

export const getTokenValueUsingQuoter = async (
  tokenIn: Token
): Promise<number> => {
  const amountOut = new TokenAmount(USDC, parseUnits("1", USDC.decimals));
  const bestTrade = await QuoterHelper.findBestPath(
    tokenIn,
    tokenIn.equals(WMAS),
    USDC,
    false,
    amountOut,
    false,
    3,
    web3Client,
    CHAIN_ID
  );
  try {
    return Number(bestTrade.executionPrice.toSignificant());
  } catch (e) {
    return 0;
  }
};

export const getTokenValue = async (
  token: Token,
  adjusted = true
): Promise<number> => {
  if (token.equals(USDC)) return 1;
  return getTokenValueUsingQuoter(token);
};

export const fetchDCA = async (
  id: number,
  userAddress: string
): Promise<DCA> => {
  return web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: dcaSC,
        key: strToBytes("D::".concat(userAddress.concat(id.toString()))),
      },
    ])
    .then((res) => {
      if (!res[0].candidate_value) throw new Error(`DCA ${id} not found`);

      const dca = decodeDcaTx(res[0].candidate_value);

      return {
        ...dca,
        id,
        userAddress,
        status: Status.ACTIVE,
        txHash: "",
      };
    });
};

export const fetchTokenFromAddress = async (
  tokenAddress: string
): Promise<Token> => {
  const token = new IERC20(tokenAddress, web3Client);
  const decimals = await token.decimals();

  return toToken({ address: token.address, decimals });
};

export const getDatastoreKeys = async (address: string): Promise<string[]> =>
  web3Client
    .publicApi()
    .getAddresses([address])
    .then((r) =>
      r[0].candidate_datastore_keys.map((v) => String.fromCharCode(...v))
    );
