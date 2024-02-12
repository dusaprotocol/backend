import { Args, ArrayTypes, IEvent, strToBytes } from "@massalabs/massa-web3";
import { CHAIN_ID } from "./config";
import { web3Client } from "./client";
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
import { DCA, Prisma, Status } from "@prisma/client";
import { ONE_DAY, TIME_BETWEEN_TICKS } from "./utils";
import { decodeDcaTx } from "../indexer/src/decoder";

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
  tokenIn: Token
): Promise<number> => {
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
  token: Token,
  adjusted = true
): Promise<number> => {
  if (token.equals(USDC)) return 1;
  return getTokenValueUsingQuoter(token);
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

  const token = await prisma.token.findUnique({
    where: {
      address,
    },
  });
  if (!token) {
    logger.warn(`Token ${address} not found in DB`);
    return fetchTokenFromAddress(address);
  }

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
      if (!res[0].candidate_value) throw new Error(`DCA ${id} not found`);

      const dca = decodeDcaTx(res[0].candidate_value);

      return {
        ...dca,
        id,
        userAddress,
        status: Status.ACTIVE,
        txHash: "",
      };
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
  pool: Prisma.PoolGetPayload<{ include: { token0: true; token1: true } }>
) => {
  const { address: poolAddress, binStep } = pool;
  const [token0, token1] = [pool.token0, pool.token1].map((token) => {
    return new Token(CHAIN_ID, token.address, token.decimals);
  });
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
        fees: Math.round(res._sum.feesUsdValue || 0),
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
    (binId) =>
      adjustPrice(
        getPriceFromId(binId, binStep),
        token0.decimals,
        token1.decimals
      )
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

export const getDatastoreKeys = async (address: string): Promise<string[]> =>
  web3Client
    .publicApi()
    .getAddresses([address])
    .then((r) =>
      r[0].candidate_datastore_keys.map((v) => String.fromCharCode(...v))
    );

// TESTING PURPOSE

export const radius = (x: number, pct: number): [number, number] => [
  x - (x * pct) / 100,
  x + (x * pct) / 100,
];
