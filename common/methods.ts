import { IEvent } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./config";
import { Bin, Fraction, Token, TokenAmount } from "@dusalabs/sdk";
import { Prisma, Token as PrismaToken } from "@prisma/client";
import { ONE_DAY, getDailyTick } from "./utils";

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

export const roundFraction = (amount: Fraction, precision = 6) =>
  Number(amount.toSignificant(precision));

export const calculateUSDValue = (
  amount0: TokenAmount,
  token0Value: number,
  amount1: TokenAmount,
  token1Value: number
): number =>
  roundFraction(
    amount0
      .multiply(toFraction(token0Value))
      .add(amount1.multiply(toFraction(token1Value)))
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
