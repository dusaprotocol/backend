import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./config";
import {
  Bin as _Bin,
  Fraction,
  ILBPair,
  Token,
  TokenAmount,
} from "@dusalabs/sdk";
import { Prisma, Token as PrismaToken } from "@prisma/client";
import { ONE_DAY, getDailyTick } from "./utils";
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
  }
};

const dayDiff = (date1: Date, date2: Date): number =>
  Math.round(Math.abs(date1.getTime() - date2.getTime()) / ONE_DAY);

export const getDatastoreKeys = async (address: string): Promise<string[]> =>
  web3Client
    .publicApi()
    .getAddresses([address])
    .then((r) =>
      r[0].candidate_datastore_keys.map((v) => String.fromCharCode(...v))
    );

// TODO: move this to SDK? (copied from interface)

export interface Bin {
  id: number;
  amount0: bigint;
  amount1: bigint;
  amountLBT: bigint;
}

export const fetchUserLiquidityBins = async (
  account: string,
  address: string
): Promise<Bin[]> => {
  const ids = await new ILBPair(address, web3Client).getUserBinIds(account);

  const bs = ids.flatMap((id) => [
    { address, key: strToBytes(`bin::${id}`) },
    {
      address,
      key: strToBytes(`balances::${id}${account}`),
    },
    { address, key: strToBytes(`total_supplies::${id}`) },
  ]);

  return web3Client
    .publicApi()
    .getDatastoreEntries(bs)
    .then(async (entries) => {
      const res: Bin[] = [];

      entries.forEach((entry, i) => {
        if (i % 3 !== 0) return; // skip balances::${id}${account} and total_supplies::${id}

        const resBin = entry.candidate_value;
        const resBalance = entries[i + 1].candidate_value;
        const resSupply = entries[i + 2].candidate_value;
        if (!resBin || !resBalance || !resSupply) {
          res.push({
            id: ids[i / 3],
            amountLBT: 0n,
            amount0: 0n,
            amount1: 0n,
          });
          return;
        }

        const returnValueBin = new Args(resBin);
        const totalAmount0 = returnValueBin.nextU256();
        const totalAmount1 = returnValueBin.nextU256();

        const returnValueBalance = new Args(resBalance);
        const lbTokenAmount = returnValueBalance.nextU256();
        if (lbTokenAmount !== 0n) {
          const returnValueSupply = new Args(resSupply);
          const totalLBT = returnValueSupply.nextU256();

          const amount0 = (lbTokenAmount * totalAmount0) / totalLBT;
          const amount1 = (lbTokenAmount * totalAmount1) / totalLBT;

          res.push({
            amount0,
            amount1,
            amountLBT: lbTokenAmount,
            id: ids[i / 3],
          });
        }
      });

      return res;
    });
};

export const sumBinAmounts = (bins: Bin[]) =>
  bins.reduce(
    (acc, bin) => ({
      amount0: acc.amount0 + bin.amount0,
      amount1: acc.amount1 + bin.amount1,
    }),
    { amount0: 0n, amount1: 0n }
  );

export interface Pool {
  token0: Token;
  token1: Token;
  binStep: number;
}

export const fetchUserLiquidity = async (
  pool: Pool,
  poolAddress: string,
  account: string
) => {
  const liq = await fetchUserLiquidityBins(account, poolAddress);
  const { amount0, amount1 } = sumBinAmounts(liq);

  const fees = await new ILBPair(poolAddress, web3Client).pendingFees(
    account,
    liq.map((bin) => bin.id)
  );

  const res: PoolLiquidity = {
    ...pool,
    amount0,
    amount1,
    fees0: fees.amount0,
    fees1: fees.amount1,
  };
  return { ...res, liq };
};

export interface PoolLiquidity {
  token0: Token;
  token1: Token;
  binStep: number;
  amount0: bigint;
  amount1: bigint;
  fees0: bigint;
  fees1: bigint;
}

export const calcPoolValue = (
  pool: PoolLiquidity,
  token0Value: number,
  token1Value: number
) => {
  const token0Amount = new TokenAmount(pool.token0, pool.amount0);
  const token1Amount = new TokenAmount(pool.token1, pool.amount1);
  const value = roundFraction(
    token0Amount
      .multiply(toFraction(token0Value))
      .add(token1Amount.multiply(toFraction(token1Value)))
  );
  return value;
};

// TESTING PURPOSE

export const radius = (x: number, pct: number): [number, number] => [
  x - (x * pct) / 100,
  x + (x * pct) / 100,
];
