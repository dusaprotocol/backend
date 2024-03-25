import { Prisma } from "@prisma/client";
import { prisma } from "../common/db";
import logger from "../common/logger";
import { getDailyTick } from "../common/utils";
import { IERC20, Token, TokenAmount } from "@dusalabs/sdk";
import { web3Client } from "../common/client";
import {
  calcPoolValue,
  fetchUserLiquidity,
  toFraction,
} from "../common/methods";
import { CHAIN_ID } from "../common/config";
import { getTokenValue } from "../common/datastoreFetcher";

(async () => {
  const users = await prisma.user.findMany();
  const date = getDailyTick();
  const tokens = await prisma.token
    .findMany()
    .then((res) => res.map((t) => new Token(CHAIN_ID, t.address, t.decimals)));
  const pools = await prisma.pool.findMany({
    include: { token0: true, token1: true },
  });
  const tokenPrices = await Promise.all(tokens.map((t) => getTokenValue(t)));
  users.forEach(async (user) => {
    const balances = await Promise.all(
      tokens.map((token) =>
        new IERC20(token.address, web3Client).balanceOf(user.address)
      )
    );
    const tokenValues = balances.map((balance, i) =>
      Number(
        new TokenAmount(tokens[i], balance).multiply(
          toFraction(tokenPrices[i]).toSignificant(6)
        )
      )
    );
    const tokensValue = tokenValues.reduce((a, b) => a + b, 0);

    const token0Index = tokens.findIndex(
      (token) => token.address === pools[0].token0.address
    );
    const token1Index = tokens.findIndex(
      (token) => token.address === pools[0].token1.address
    );
    if (token0Index === -1 || token1Index === -1) {
      throw new Error("Token not found in tokens list");
    }

    const poolPositions = await Promise.all(
      pools.map((pool) =>
        fetchUserLiquidity(
          {
            ...pool,
            token0: tokens[token0Index],
            token1: tokens[token1Index],
          },
          pool.address,
          user.address
        )
      )
    );
    const poolValues = poolPositions.map((position, i) =>
      calcPoolValue(
        position,
        tokenValues[token0Index],
        tokenValues[token1Index]
      )
    );
    const poolsValue = poolValues.reduce((a, b) => a + b, 0);

    const totalValue = tokensValue + poolsValue;
    prisma.userAnalytics.create({
      data: {
        userAddress: user.address,
        totalValue,
        balances: {
          createMany: {
            data: balances.map((balance, i) => ({
              tokenAddress: tokens[i].address,
              balance: balances[i].toString(),
              value: tokenValues[i],
            })),
          },
        },
        date,
      },
    });
  });

  await prisma.$disconnect().then(() => logger.silly("Disconnected from DB"));
})();
