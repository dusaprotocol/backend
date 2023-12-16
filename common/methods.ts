import { Args, ArrayTypes, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID, web3Client } from "./client";
import { factorySC, USDC, WMAS } from "./contracts";
import logger from "./logger";
import {
  Bin,
  ChainId,
  DCA_MANAGER_ADDRESS,
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
import { createAnalytic } from "../indexer/src/db";
import { DCA, Status } from "@prisma/client";
import { TIME_BETWEEN_TICKS } from "./utils";

export const getPriceFromId = Bin.getPriceFromId;
export const getIdFromPrice = Bin.getIdFromPrice;

export const getCallee = (callStack: string[]): string => {
  return callStack[callStack.length - 1];
};

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

export const fetchPairAddress = async (
  token0: string,
  token1: string,
  binStep: number
): Promise<string> =>
  new IFactory(factorySC, web3Client)
    .getLBPairInformation(token0, token1, binStep)
    .then((res) => res.LBPair);

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
  try {
    return Number(bestTrade.executionPrice.toSignificant());
  } catch (e) {
    return 0;
  }
};

export const getTokenValue = async (
  _tokenAddress: string,
  // CHAIN_ID: ChainId
  adjusted = true,
  opts?: {
    poolAddress: string;
    binStep: number;
  }
): Promise<number> => {
  const tokenAddress = _tokenAddress.replace("_", ""); // TEMP: handle MAS/WMAS

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
  const price = getPriceFromId(pairInfo.activeId, binStep);

  if (!adjusted) return price;

  const [token0Address, token1Address] = sortTokenAddresses(
    tokenAddress,
    USDC.address
  );
  const token0Decimals = await new IERC20(token0Address, web3Client).decimals();
  const token1Decimals = await new IERC20(token1Address, web3Client).decimals();
  const priceAdjusted = adjustPrice(price, token0Decimals, token1Decimals);
  return tokenAddress < USDC.address ? priceAdjusted : 1 / priceAdjusted;
};

export const sortTokenAddresses = (
  tokenA: string,
  tokenB: string
): [string, string] => (tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]);

export const sortTokens = (tokenA: Token, tokenB: Token): [Token, Token] =>
  tokenA.address < tokenB.address ? [tokenA, tokenB] : [tokenB, tokenA];

export const adjustPrice = (
  price: number,
  decimals0: number,
  decimals1: number
): number => price * 10 ** (decimals0 - decimals1);

export const toFraction = (price: number): Fraction => {
  const value = BigInt(Math.round((price || 1) * 1e18));
  return new Fraction(value, BigInt(1e18));
};

export const getTokenFromAddress = async (
  tokenAddress: string
): Promise<Token> => {
  const address = tokenAddress.replace("_", ""); // TEMP: handle MAS/WMAS

  const token = await prisma.token
    .findUniqueOrThrow({
      where: {
        address,
      },
    })
    .catch(() => {
      return fetchTokenFromAddress(address);
    });
  if (!token) throw new Error(`Token not found: ${address}`);

  return new Token(
    CHAIN_ID,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
};

export const fetchDCA = async (
  id: number,
  userAddress: string
): Promise<DCA> => {
  return web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: DCA_MANAGER_ADDRESS[CHAIN_ID],
        key: strToBytes("D::".concat(userAddress.concat(id.toString()))),
      },
    ])
    .then((res) => {
      if (!res[0].candidate_value) throw new Error("No DCA found");
      const args = new Args(res[0].candidate_value);
      const amountEachDCA = args.nextU256();
      const interval = Number(args.nextU64());
      const nbOfDCA = Number(args.nextU64());
      const tokenPathStr: string[] = args.nextArray(ArrayTypes.STRING);
      const tokenIn = tokenPathStr[0];
      const tokenOut = tokenPathStr[tokenPathStr.length - 1];
      const startTime = new Date(Number(args.nextU64()));
      const endTime =
        nbOfDCA == 0 ? startTime : new Date(Number(args.nextU64()));

      const dca: DCA = {
        id,
        amountEachDCA,
        interval,
        nbOfDCA,
        tokenIn,
        tokenOut,
        startTime,
        endTime,
        userAddress,
        status: Status.ACTIVE,
        txHash: "",
      };
      return dca;
    });
};

export const fetchTokenFromAddress = async (
  tokenAddress: string
): Promise<Token> => {
  const token = new IERC20(tokenAddress, web3Client);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);

  return new Token(CHAIN_ID, token.address, decimals, symbol, name);
};

export const fetchNewAnalytics = async (
  poolAddress: string,
  binStep: number
) => {
  const pairInfo = await PairV2.getLBPairReservesAndId(poolAddress, web3Client);

  const tokens = await new ILBPair(poolAddress, web3Client).getTokens();
  const [token0, token1] = await Promise.all(tokens.map(getTokenFromAddress));

  const { reserveX: token0Locked, reserveY: token1Locked } = pairInfo;
  const usdLocked = await calculateUSDLocked(
    token0,
    token0Locked,
    token1,
    token1Locked
  );

  const { volume, fees } = await prisma.swap
    .aggregate({
      where: {
        poolAddress,
        timestamp: {
          gte: new Date(Date.now() - TIME_BETWEEN_TICKS),
        },
      },
      _sum: {
        usdValue: true,
        feesUsdValue: true,
      },
    })
    .then((res) => {
      return {
        volume: res._sum.usdValue || 0,
        fees: res._sum.feesUsdValue || 0,
      };
    });

  const openId = pairInfo.activeId;
  const closeId = await prisma.swap
    .findFirst({
      where: {
        poolAddress,
        timestamp: {
          gte: new Date(Date.now() - TIME_BETWEEN_TICKS),
        },
      },
      orderBy: {
        timestamp: "desc",
      },
    })
    .then((res) => res?.binId || openId);
  const { highId, lowId } = await prisma.swap
    .aggregate({
      where: {
        poolAddress,
        timestamp: {
          gte: new Date(Date.now() - TIME_BETWEEN_TICKS),
        },
      },
      _max: {
        binId: true,
      },
      _min: {
        binId: true,
      },
    })
    .then((res) => {
      return {
        highId: res._max.binId || openId,
        lowId: res._min.binId || openId,
      };
    });
  const [open, close, high, low] = [openId, closeId, highId, lowId].map(
    (binId) => getPriceFromId(binId, binStep)
  );

  if (!open) throw new Error("Price is 0");

  return await createAnalytic({
    poolAddress,
    token0Locked: token0Locked.toString(),
    token1Locked: token1Locked.toString(),
    usdLocked,
    volume,
    fees,
    close,
    open,
    high,
    low,
  });
};

export const calculateUSDLocked = async (
  token0: Token,
  token0Locked: bigint,
  token1: Token,
  token1Locked: bigint
): Promise<number> => {
  const [token0Value, token1Value] = await Promise.all(
    [token0, token1].map((token) => getTokenValue(token.address, true))
  );
  const usdLocked = new TokenAmount(token0, token0Locked)
    .multiply(toFraction(token0Value))
    .add(
      new TokenAmount(token1, token1Locked).multiply(toFraction(token1Value))
    )
    .toSignificant(6);
  return Number(usdLocked);
};

// TESTING PURPOSE

export const radius = (x: number, pct: number): [number, number] => [
  x - (x * pct) / 100,
  x + (x * pct) / 100,
];
