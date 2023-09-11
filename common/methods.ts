import { Args, IEvent, bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { web3Client } from "./client";
import { factorySC, usdcSC } from "./contracts";
import logger from "./logger";
import { Token } from "@prisma/client";

const REAL_ID_SHIFT = 2 ** 17;

export const getPriceFromId = (id: number, binStep: number): number =>
  (1 + binStep / 10000) ** (id - REAL_ID_SHIFT);

export const getIdFromPrice = (price: number, binStep: number): number =>
  Math.round(Math.log(price) / Math.log(1 + binStep / 10000) + REAL_ID_SHIFT);

export const getCallee = (event: IEvent): string =>
  event.context.call_stack[event.context.call_stack.length - 1];

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

// common

export const fetchPairBinSteps = async (
  token0: string,
  token1: string
): Promise<number[]> =>
  web3Client
    .smartContracts()
    .readSmartContract({
      targetAddress: factorySC,
      targetFunction: "getAvailableLBPairBinSteps",
      maxGas: BigInt(100_000_000),
      parameter: new Args().addString(token0).addString(token1).serialize(),
    })
    .then((res) => {
      return res.info.output_events[0]?.data.split(",").map(Number);
    });

export const fetchPairAddress = async (
  token0: string,
  token1: string,
  binStep: number
): Promise<string | undefined> =>
  web3Client
    .smartContracts()
    .readSmartContract({
      targetAddress: factorySC,
      targetFunction: "getLBPairInformation",
      parameter: new Args()
        .addString(token0)
        .addString(token1)
        .addU32(binStep)
        .serialize(),
      maxGas: BigInt(100_000_000),
    })
    .then((res) => {
      const returnValue = new Args(res.returnValue);
      const _ = returnValue.nextU32();
      const lpAddress = returnValue.nextString();
      return lpAddress;
    })
    .catch((err) => {
      logger.error(err);
      return undefined;
    });

export const getTokenValue = async (
  tokenAddress: string
): Promise<number | undefined> => {
  if (tokenAddress === usdcSC) return 1;

  const binSteps = await fetchPairBinSteps(tokenAddress, usdcSC);
  const pairAddress = await fetchPairAddress(tokenAddress, usdcSC, binSteps[0]);
  if (!pairAddress) return;

  const pairInfo = await getPairInformation(pairAddress);
  if (!pairInfo) return;

  const price = getPriceFromId(pairInfo.activeId, binSteps[0]);
  return tokenAddress < usdcSC ? price : 1 / price;
};

interface PairInformation {
  activeId: number;
  reserveX: bigint;
  reserveY: bigint;
  feesX: {
    total: bigint;
    protocol: bigint;
  };
  feesY: {
    total: bigint;
    protocol: bigint;
  };
}

export const getPairInformation = async (
  pairAddress: string
): Promise<PairInformation | undefined> => {
  return web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: pairAddress,
        key: strToBytes("PAIR_INFORMATION"),
      },
    ])
    .then((r) => {
      const pairInfoData = r[0].final_value;
      if (!pairInfoData) return;

      const args = new Args(pairInfoData);
      const activeId = args.nextU32();
      const reserveX = args.nextU64();
      const reserveY = args.nextU64();
      const feesX = {
        total: args.nextU64(),
        protocol: args.nextU64(),
      };
      const feesY = {
        total: args.nextU64(),
        protocol: args.nextU64(),
      };
      return { activeId, reserveX, reserveY, feesX, feesY };
    });
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
): Promise<Token | undefined> => {
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
        const token: Token = {
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
