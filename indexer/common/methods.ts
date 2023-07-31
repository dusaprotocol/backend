import { Args, IEvent, bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { web3Client } from "./client";
import { factorySC, usdcSC } from "./contracts";
import logger from "./logger";

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
    })
    .catch((err) => {
      logger.error(err.toString());
      return undefined;
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
      // const binStep = new Args(res.returnValue).nextU32();
      // const NativeTypeU32 = 3;
      // const binSteps = new Args(res.returnValue).nextNativeTypeArray(
      //   NativeTypeU32
      // );
      // console.log({ binStep, binSteps });

      return res.info.output_events[0]?.data.split(",").map(Number);
    })
    .catch((err) => {
      logger.error(err.toString());
      return [];
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
      logger.error(err.toString());
      return undefined;
    });

export const getTokenValue = async (
  tokenAddress: string
): Promise<number | undefined> => {
  if (tokenAddress === usdcSC) return 1;

  const binSteps = await fetchPairBinSteps(tokenAddress, usdcSC);
  if (!binSteps.length) return;

  const pairAddress = await fetchPairAddress(tokenAddress, usdcSC, binSteps[0]);
  if (!pairAddress) return;

  const price = await getActivePrice(pairAddress, binSteps[0]);
  return tokenAddress < usdcSC ? price : 1 / price;
};

export const getActivePrice = (
  poolAddress: string,
  binStep?: number
): Promise<number> =>
  web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: poolAddress,
        key: strToBytes("PAIR_INFORMATION"),
      },
      {
        address: poolAddress,
        key: strToBytes("FEES_PARAMETERS"),
      },
    ])
    .then((r) => {
      const pairInfoData = r[0].final_value;
      const feesData = r[1].final_value;
      if (!pairInfoData || !feesData) return 0;

      const activeId = new Args(pairInfoData).nextU32();
      const binStep = new Args(feesData).nextU32();
      return getPriceFromId(activeId, binStep);
    })
    .catch((err) => {
      logger.error(err.toString());
      return 0;
    });

export const getLockedReserves = (
  poolAddress: string
): Promise<[bigint, bigint]> =>
  web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: poolAddress,
        key: strToBytes("PAIR_INFORMATION"),
      },
    ])
    .then((r): [bigint, bigint] => {
      const pairInfoData = r[0].final_value;
      if (!pairInfoData) return [BigInt(0), BigInt(0)];

      const pairInformation = new Args(pairInfoData);
      const _activeId = pairInformation.nextU32();
      const reserveX = pairInformation.nextU64();
      const reserveY = pairInformation.nextU64();
      return [reserveX, reserveY];
    })
    .catch((err) => {
      logger.error(err.toString());
      return [BigInt(0), BigInt(0)];
    });

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
