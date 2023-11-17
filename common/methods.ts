import { Args, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID, web3Client } from "./client";
import { factorySC, usdcSC } from "./contracts";
import logger from "./logger";
import {
  Bin,
  ChainId,
  EventDecoder,
  Fraction,
  IERC20,
  IFactory,
  ILBPair,
  LB_FACTORY_ADDRESS,
  PairV2,
  Token,
  USDC as _USDC,
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
  // CHAIN_ID: ChainId
): Promise<number | undefined> => {
  const USDC = _USDC[CHAIN_ID];
  const factory = new IFactory(LB_FACTORY_ADDRESS[CHAIN_ID], web3Client);
  if (tokenAddress === USDC.address) return 1;

  const binSteps = await factory.getAvailableLBPairBinSteps(
    tokenAddress,
    USDC.address
  );
  const binStep = binSteps[0];

  const pairAddress = await factory
    .getLBPairInformation(tokenAddress, USDC.address, binStep)
    .then((r) => r.LBPair);

  const pairInfo = await PairV2.getLBPairReservesAndId(pairAddress, web3Client);

  const price = Bin.getPriceFromId(pairInfo.activeId, binStep);
  const token0Address =
    tokenAddress < USDC.address ? tokenAddress : USDC.address;
  const token1Address =
    tokenAddress < USDC.address ? USDC.address : tokenAddress;
  const token0Decimals = await new IERC20(token0Address, web3Client).decimals();
  const token1Decimals = await new IERC20(token1Address, web3Client).decimals();

  return (
    (tokenAddress < USDC.address ? price : 1 / price) *
    10 ** (token0Decimals - token1Decimals)
  );
};

export const toFraction = (price: number): Fraction => {
  const value = BigInt(Math.round((price || 1) * 1e18));
  return new Fraction(value, BigInt(1e18));
};

export const getPairAddressTokens = async (
  pairAddress: string
): Promise<[string, string] | undefined> => {
  return new ILBPair(pairAddress, web3Client).getTokens().catch((err) => {
    logger.warn(err);
    return undefined;
  });
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
  return new Token(
    CHAIN_ID,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
};
