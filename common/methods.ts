import { Args, IEvent, bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./config";
import logger from "./logger";
import { Bin, Fraction, ILBPair, Token, TokenAmount } from "@dusalabs/sdk";
import { prisma } from "./db";
import { createAnalytic } from "../indexer/src/db";
import { DCA, Prisma, Status } from "@prisma/client";
import { ONE_DAY, TIME_BETWEEN_TICKS } from "./utils";
import { fetchTokenFromAddress, getTokenValue } from "./datastoreFetcher";
import { web3Client } from "./client";

export const getPriceFromId = Bin.getPriceFromId;
export const getIdFromPrice = Bin.getIdFromPrice;

export const getCallee = (callStack: string[]): string => {
  return callStack[callStack.length - 1];
};

export const isLiquidityEvent = (event: IEvent, poolAddress: string): boolean =>
  getCallee(event.context.call_stack) === poolAddress &&
  (event.data.startsWith("WITHDRAWN_FROM_BIN:") ||
    event.data.startsWith("DEPOSITED_TO_BIN:"));

export const isSwapEvent = (event: IEvent, poolAddress: string): boolean =>
  getCallee(event.context.call_stack) === poolAddress &&
  event.data.startsWith("SWAP:");

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

export const toToken = (
  {
    address,
    decimals,
    symbol,
    name,
  }: {
    address: string;
    decimals: number;
    symbol?: string;
    name?: string;
  },
  chainId = CHAIN_ID
): Token => {
  return new Token(chainId, address, decimals, symbol, name);
};

export const getTokenFromAddress = async (
  tokenAddress: string
): Promise<Token> => {
  const address = tokenAddress.replace("_", ""); // TEMP: handle MAS/WMAS

  const token = await prisma.token.findUnique({
    where: {
      address,
    },
  });
  if (!token) {
    logger.warn(`Token ${address} not found in DB`);
    return fetchTokenFromAddress(address);
  }

  return toToken(token);
};

/**
 * Fetch a pool information (reserves, price, volume) and insert it into the database
 * @param pool
 * @returns
 */
export const fetchNewAnalytics = async (
  pool: Prisma.PoolGetPayload<{ include: { token0: true; token1: true } }>
) => {
  const { address: poolAddress, binStep } = pool;
  const [token0, token1] = [pool.token0, pool.token1].map((token) =>
    toToken(token)
  );
  const pairInfo = await new ILBPair(
    poolAddress,
    web3Client
  ).getReservesAndId();

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
        volume: Math.round(res._sum.usdValue || 0),
        fees: res._sum.feesUsdValue || 0,
      };
    });

  const openId = pairInfo.activeId;
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
  const [open, high, low] = [openId, highId, lowId].map((binId) =>
    adjustPrice(
      getPriceFromId(binId, binStep),
      token0.decimals,
      token1.decimals
    )
  );
  if (!open) throw new Error("Invalid price");

  // update previous tick with close, high and low
  await prisma.analytics
    .update({
      where: {
        poolAddress_date: {
          poolAddress,
          date: new Date(Date.now() - TIME_BETWEEN_TICKS),
        },
      },
      data: {
        close: open,
        high,
        low,
      },
    })
    .catch(() => logger.warn("failed to update previous tick"));

  return createAnalytic({
    poolAddress,
    token0Locked: token0Locked.toString(),
    token1Locked: token1Locked.toString(),
    usdLocked,
    volume,
    fees,
    open,
    close: open,
    high: open,
    low: open,
  });
};

export const calculateUSDLocked = async (
  token0: Token,
  token0Locked: bigint,
  token1: Token,
  token1Locked: bigint
): Promise<number> => {
  const [token0Value, token1Value] = await Promise.all(
    [token0, token1].map((token) => getTokenValue(token))
  );
  const usdLocked = new TokenAmount(token0, token0Locked)
    .multiply(toFraction(token0Value))
    .add(
      new TokenAmount(token1, token1Locked).multiply(toFraction(token1Value))
    )
    .toSignificant(6);
  return Number(usdLocked);
};

export const calculateStreak = (
  params: Prisma.MakerGetPayload<{}>[]
): number => {
  if (!params.length) return 0;

  let streak = 0;
  let lastDay = new Date();
  params.forEach((r) => {
    if (r.accruedFeesUsd > 0) {
      console.log(dayDiff(r.date, lastDay));
      if (dayDiff(r.date, lastDay) <= 3) {
        streak++;
        lastDay = r.date;
      } else streak = 0;
    }
  });
  return streak;
};

const dayDiff = (date1: Date, date2: Date): number =>
  Math.round(Math.abs(date1.getTime() - date2.getTime()) / ONE_DAY);

// TESTING PURPOSE

export const radius = (x: number, pct: number): [number, number] => [
  x - (x * pct) / 100,
  x + (x * pct) / 100,
];
