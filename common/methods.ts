import { Args, IEvent, bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./config";
import logger from "./logger";
import { Bin, Fraction, ILBPair, Token, TokenAmount } from "@dusalabs/sdk";
import { prisma } from "./db";
import { createAnalytic } from "../indexer/src/db";
import { Prisma, Token as PrismaToken } from "@prisma/client";
import {
  ONE_DAY,
  TIME_BETWEEN_TICKS,
  getClosestTick,
  getDailyTick,
} from "./utils";
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
  token: Omit<PrismaToken, "name" | "symbol">,
  chainId = CHAIN_ID
): Token => {
  return new Token(chainId, token.address, token.decimals);
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
  const [token0Value, token1Value] = await Promise.all([
    getTokenValue(token0),
    getTokenValue(token1),
  ]);
  const usdLocked = calculateUSDValue(
    new TokenAmount(token0, token0Locked),
    token0Value,
    new TokenAmount(token1, token1Locked),
    token1Value
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
          date: getClosestTick(Date.now() - TIME_BETWEEN_TICKS),
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

export const calculateUSDValue = (
  amount0: TokenAmount,
  token0Value: number,
  amount1: TokenAmount,
  token1Value: number
): number =>
  Number(
    amount0
      .multiply(toFraction(token0Value))
      .add(amount1.multiply(toFraction(token1Value)))
      .toSignificant(6)
  );

/**
 * Calculate the weekly streak of a maker
 * @param params - list of dates
 * @returns
 */
export const calculateStreak = (
  params: Prisma.MakerGetPayload<{}>[]
): number => {
  if (!params.length) return 0;

  const today = getDailyTick();

  let streak = 0;
  let currentDate = today;

  // start on Monday
  while (currentDate.getDay() !== 1) {
    currentDate = new Date(currentDate.getTime() - ONE_DAY);
  }

  while (true) {
    // check if there is a record for the current week range
    if (
      params.some(
        (p) =>
          p.date.getTime() < currentDate.getTime() &&
          p.date.getTime() > currentDate.getTime() - ONE_DAY * 7
      )
    ) {
      streak++;
    } else {
      return streak;
    }
    currentDate = new Date(currentDate.getTime() - ONE_DAY * 7);
  }
};
