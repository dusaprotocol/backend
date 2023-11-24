import type { Pool } from "@prisma/client";
import { getBinStep } from "../../common/methods";
import { web3Client } from "../../common/client";
import { factorySC } from "../../common/contracts";
import { bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "../../common/db";
import { IERC20, ILBPair } from "@dusalabs/sdk";

async function createPools() {
  const pools: Pick<Pool, "address" | "binStep">[] = [];
  await web3Client
    .publicApi()
    .getDatastoreEntries([{ address: factorySC, key: strToBytes("ALL_PAIRS") }])
    .then(async (res) => {
      const bs = res[0].final_value;
      if (!bs) return;

      const pairs = bytesToStr(bs).split(":");
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (!pair) continue;

        const binStep = await getBinStep(pair);
        if (!binStep) continue;

        pools.push({
          address: pair,
          binStep,
        });
      }
    });

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const [token0Address, token1Address] = await new ILBPair(
      pool.address,
      web3Client
    ).getTokens();
    const _token0 = new IERC20(token0Address, web3Client);
    const _token1 = new IERC20(token1Address, web3Client);
    const [name0, symbol0, decimals0] = await Promise.all([
      _token0.name(),
      _token0.symbol(),
      _token0.decimals(),
    ]);
    const [name1, symbol1, decimals1] = await Promise.all([
      _token1.name(),
      _token1.symbol(),
      _token1.decimals(),
    ]);

    try {
      await prisma.token.upsert({
        where: {
          address: token0Address,
        },
        create: {
          address: token0Address,
          decimals: decimals0,
          symbol: symbol0,
          name: name0,
        },
        update: {},
      });
      await prisma.token.upsert({
        where: {
          address: token1Address,
        },
        create: {
          address: token1Address,
          decimals: decimals1,
          symbol: symbol1,
          name: name1,
        },
        update: {},
      });

      prisma.pool
        .create({
          data: {
            ...pool,
            token0: {
              connect: {
                address: token0Address,
              },
            },
            token1: {
              connect: {
                address: token1Address,
              },
            },
          },
        })
        .then((res) => console.log(res))
        .catch((err) => console.error(err));
    } catch (err) {
      console.error(err);
    }
  }
}

(() => {
  createPools();
})();
