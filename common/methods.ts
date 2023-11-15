import {
  Args,
  ArrayTypes,
  IEvent,
  bytesToArray,
  bytesToStr,
  strToBytes,
} from "@massalabs/massa-web3";
import { CHAIN_ID, web3Client } from "./client";
import { factorySC, usdcSC } from "./contracts";
import logger from "./logger";
import { Token as PrismaToken } from "@prisma/client";
import {
  Bin,
  EventDecoder,
  Fraction,
  IFactory,
  PairV2,
  Token,
} from "@dusalabs/sdk";
import { prisma } from "./db";

export const getPriceFromId = Bin.getPriceFromId;
export const getIdFromPrice = Bin.getIdFromPrice;

export const getCallee = (callStack: string[]): string => {
  return callStack[callStack.length - 1];
};

export const getBinStep = (pairAddress: string): Promise<number | undefined> =>
  web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: pairAddress,
        key: strToBytes("FEES_PARAMETERS"),
      },
    ])
    .then((entries) => {
      if (!entries[0].final_value) return;

      const args = new Args(entries[0].final_value);
      const binStep = args.nextU32();
      return binStep;
    });

export const fetchPairBinSteps = async (
  token0: string,
  token1: string
): Promise<number[]> =>
  new IFactory(factorySC, web3Client)
    .getAvailableLBPairBinSteps(token0, token1)
    .catch((err) => {
      logger.warn(err);
      return [];
    });

export const fetchPairAddress = async (
  token0: string,
  token1: string,
  binStep: number
): Promise<string | undefined> =>
  new IFactory(factorySC, web3Client)
    .getLBPairInformation(token0, token1, binStep)
    .then((res) => res.LBPair)
    .catch((err) => {
      const errMsg = EventDecoder.decodeError(err.message);
      logger.info(
        ["fetchingPairAddress", errMsg, token0, token1, binStep].join(" ")
      );
      return undefined;
    });

export const getTokenValue = async (
  tokenAddress: string
): Promise<number | undefined> => {
  if (tokenAddress === usdcSC) return 1;

  const binSteps = await fetchPairBinSteps(tokenAddress, usdcSC);
  if (!binSteps || !binSteps.length) return;
  const binStep = binSteps[0];

  const pairAddress = await fetchPairAddress(tokenAddress, usdcSC, binStep);
  if (!pairAddress) return;

  const pairInfo = await PairV2.getLBPairReservesAndId(pairAddress, web3Client);
  if (!pairInfo) return;

  const price = getPriceFromId(pairInfo.activeId, binStep);
  const token0Address = tokenAddress < usdcSC ? tokenAddress : usdcSC;
  const token1Address = tokenAddress < usdcSC ? usdcSC : tokenAddress;
  const token0 = await getTokenFromAddress(token0Address);
  const token1 = await getTokenFromAddress(token1Address);
  if (!token0 || !token1) return;

  return (
    (tokenAddress < usdcSC ? price : 1 / price) *
    10 ** (token0.decimals - token1.decimals)
  );
};

export const toFraction = (price: number): Fraction => {
  const value = BigInt(Math.round((price || 1) * 1e18));
  return new Fraction(value, BigInt(1e18));
};

export const getPairAddressTokens = async (
  pairAddress: string
): Promise<[string, string] | undefined> => {
  return await web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: pairAddress,
        key: strToBytes("TOKEN_X"),
      },
      {
        address: pairAddress,
        key: strToBytes("TOKEN_Y"),
      },
    ])
    .then((r): [string, string] | undefined => {
      if (r[0].candidate_value && r[1].candidate_value)
        return [
          bytesToStr(r[0].candidate_value),
          bytesToStr(r[1].candidate_value),
        ];
    })
    .catch((err) => {
      logger.warn(err);
      return undefined;
    });
};

export const fetchTokenInfo = async (
  tokenAddress: string
): Promise<PrismaToken | undefined> => {
  return web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: tokenAddress,
        key: strToBytes("NAME"),
      },
      {
        address: tokenAddress,
        key: strToBytes("SYMBOL"),
      },
      {
        address: tokenAddress,
        key: strToBytes("DECIMALS"),
      },
    ])
    .then((res) => {
      if (
        res[0].candidate_value &&
        res[1].candidate_value &&
        res[2].candidate_value
      ) {
        const token = {
          name: bytesToStr(res[0].candidate_value),
          symbol: bytesToStr(res[1].candidate_value),
          decimals: res[2].candidate_value[0],
          address: tokenAddress,
        };
        return token;
      }
    })
    .catch(() => undefined);
};

export const getTokenFromAddress = async (
  tokenAddress: string
): Promise<Token | null> => {
  const token = await prisma.token.findUnique({
    where: {
      address: tokenAddress,
    },
  });
  if (!token) return null;
  return new Token(CHAIN_ID, token.address, token.decimals);
};
