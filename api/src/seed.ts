import type { Pool } from "@prisma/client";
import {
  fetchTokenInfo,
  getBinStep,
  getPairAddressTokens,
} from "../../common/methods";
import { web3Client } from "../../common/client";
import { factorySC } from "../../common/contracts";
import { bytesToStr, strToBytes } from "@massalabs/massa-web3";
import { prisma } from "../../common/db";

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
    const tokenAddresses = await getPairAddressTokens(pool.address);
    if (!tokenAddresses) return;

    const [token0Address, token1Address] = tokenAddresses;
    const token0 = await fetchTokenInfo(token0Address);
    const token1 = await fetchTokenInfo(token1Address);
    if (!token0 || !token1) return;

    try {
      await prisma.token.upsert({
        where: {
          address: token0.address,
        },
        create: token0,
        update: {},
      });
      await prisma.token.upsert({
        where: {
          address: token1.address,
        },
        create: token1,
        update: {},
      });

      prisma.pool
        .create({
          data: {
            ...pool,
            token0: {
              connect: {
                address: token0.address,
              },
            },
            token1: {
              connect: {
                address: token1.address,
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
