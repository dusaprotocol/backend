import { Args, strToBytes } from "@massalabs/massa-web3";
import { Args, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID, web3Client } from "./client";
import { factorySC, USDC, WMAS } from "./contracts";
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
  QuoterHelper,
  Token,
  TokenAmount,
  parseUnits,
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

export const getTokenValueUsingQuoter = async (
  tokenAddress: string
): Promise<number> => {
  const tokenIn = await getTokenFromAddress(tokenAddress);
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
  return Number(bestTrade.executionPrice.toSignificant());
};

export const getTokenValue = async (
  tokenAddress: string,
  // CHAIN_ID: ChainId
  adjusted = true,
  opts?: {
    poolAddress: string;
    binStep: number;
  }
): Promise<number> => {
  const factory = new IFactory(LB_FACTORY_ADDRESS[CHAIN_ID], web3Client);
  if (tokenAddress === USDC.address) return 1;

  const binStep = opts
    ? opts.binStep
    : await factory
        .getAvailableLBPairBinSteps(tokenAddress, USDC.address)
        .then((r) => r[0])
        .catch(() => undefined);
  if (!binStep) return getTokenValueUsingQuoter(tokenAddress);

  const pairAddress = opts
    ? opts.poolAddress
    : await factory
        .getLBPairInformation(tokenAddress, USDC.address, binStep)
        .then((r) => r.LBPair)
        .catch(() => undefined);
  if (!pairAddress) return getTokenValueUsingQuoter(tokenAddress);

  const pairInfo = await PairV2.getLBPairReservesAndId(pairAddress, web3Client);
  const price = Bin.getPriceFromId(pairInfo.activeId, binStep);

  if (!adjusted) return price;

  const token0Address =
    tokenAddress < USDC.address ? tokenAddress : USDC.address;
  const token1Address =
    tokenAddress < USDC.address ? USDC.address : tokenAddress;
  const token0Decimals = await new IERC20(token0Address, web3Client).decimals();
  const token1Decimals = await new IERC20(token1Address, web3Client).decimals();
  const priceAdjusted = price * 10 ** (token0Decimals - token1Decimals);
  return tokenAddress < USDC.address ? priceAdjusted : 1 / priceAdjusted;
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
): Promise<Token> => {
  const token = await prisma.token
    .findUnique({
      where: {
        address: tokenAddress,
      },
    })
    .catch((err) => {
      logger.warn(err);
      return fetchTokenFromAddress(tokenAddress);
    });
  if (!token) throw new Error(`Token not found: ${tokenAddress}`);

  return new Token(
    CHAIN_ID,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
};

export const fetchTokenFromAddress = async (
  tokenAddress: string
): Promise<Token | null> => {
  const token = new IERC20(tokenAddress, web3Client);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);

  return new Token(CHAIN_ID, token.address, decimals, symbol, name);
};

// TESTING PURPOSE

export const radius = (x: number, pct: number): [number, number] => [
  x - (x * pct) / 100,
  x + (x * pct) / 100,
];
