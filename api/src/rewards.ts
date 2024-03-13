import { Token as PrismaToken } from "@prisma/client";
import { prisma } from "../../common/db";
import { writeFile } from "fs";
import { Fraction, Token, TokenAmount } from "@dusalabs/sdk";
import { ONE_DAY } from "../../common/utils";
import { toFraction, toToken } from "../../common/methods";
import xlsx from "node-xlsx";
import { BigintIsh } from "@dusalabs/sdk/dist/constants";

// TYPES

type ExcelData = {
  userAddress: string;
  accruedFeesX: number;
  accruedFeesY: number;
  accruedFeesL: number;
  accruedFeesUsd: number;
  percentOfTotalFees: number;
  pairAddress: string;
  makerScore: number;
  makerRank: number;
  rewardPercentage: number;
  rewardToken: string;
  makerRewards: number;
  makerRewardsRaw: string;
  pairName: string;
  rewardEpoch: number;
  rewardAmount: number;
};

type MarketData = {
  address: string;
  epoch: number;
  start: number;
  duration: number;
  length: number;
  rewards: RewardData[];
};

type RewardData = {
  address: string;
  totalRewards: bigint;
  length: number;
  users: UserData[];
};

type UserData = {
  address: string;
  amount: bigint;
};

type JSONData = {
  length: number;
  markets: MarketData[];
};

// CONSTANTS

const FEE_WEIGHT = 0.7;

const epoch = 1;
const from = new Date(Date.UTC(2024, 2, 4));
const to = new Date(from.getTime() + ONE_DAY * 7);

// SAVE FILE

const saveFile = (data: {}) =>
  writeFile(
    "dataset.json",
    JSON.stringify(data),
    (err) => err && console.error(err)
  );

const saveXLSXFile = (rawData: ExcelData[]) => {
  const data = rawData.map((row) => {
    return Object.values(row);
    return [
      row.userAddress,
      row.accruedFeesX,
      row.accruedFeesY,
      row.accruedFeesL,
      row.accruedFeesUsd,
      row.percentOfTotalFees,
      row.pairAddress,
      row.makerScore,
      row.makerRank,
      row.rewardPercentage,
      row.rewardToken,
      row.makerRewards,
      row.makerRewardsRaw,
      row.pairName,
      row.rewardEpoch,
      row.rewardAmount,
    ];
  });
  writeFile(
    "dataset.xlsx",
    xlsx.build([
      {
        name: `Epoch ${epoch}`,
        data,
        options: {},
      },
    ]),
    (err) => err && console.error(err)
  );
};

// HELPERS

const getAccruedFees = async (poolAddress: string, makerAddress: string) => {
  return prisma.maker
    .findMany({
      where: {
        poolAddress,
        date: {
          gte: from,
          lt: to,
        },
        address: makerAddress,
      },
      select: {
        accruedFeesX: true,
        accruedFeesY: true,
        accruedFeesL: true,
      },
    })
    .then((res) => {
      return res.reduce(
        (acc, maker) => {
          return {
            accruedFeesX: acc.accruedFeesX + BigInt(maker.accruedFeesX),
            accruedFeesY: acc.accruedFeesY + BigInt(maker.accruedFeesY),
            accruedFeesL: acc.accruedFeesL + BigInt(maker.accruedFeesL),
          };
        },
        { accruedFeesX: 0n, accruedFeesY: 0n, accruedFeesL: 0n }
      );
    });
};

// MAIN

(async () => {
  const jsonData: JSONData = {
    length: 0,
    markets: [],
  };
  const excelData: ExcelData[] = [];

  const markets = await prisma.rewardPool.findMany({
    include: {
      rewardTokens: {
        include: {
          token: true,
        },
      },
      pool: {
        include: {
          token0: true,
          token1: true,
        },
      },
    },
    where: {
      epoch,
    },
  });
  for (const market of markets) {
    const {
      poolAddress,
      pool: { token0, token1, binStep },
    } = market;
    const makers = await prisma.maker
      .groupBy({
        by: ["address"],
        where: {
          poolAddress,
          date: {
            gte: from,
            lt: to,
          },
        },
        _sum: {
          volume: true,
          accruedFeesUsd: true,
        },
      })
      .then((res) => {
        return res
          .map((maker) => {
            return {
              address: maker.address,
              volume: maker._sum.volume || 0,
              accruedFeesUsd: maker._sum.accruedFeesUsd || 0,
            };
          })
          .sort((a, b) => b.accruedFeesUsd - a.accruedFeesUsd);
      });

    const totalFees = makers.reduce(
      (acc, maker) => acc + maker.accruedFeesUsd,
      0
    );
    const totalFeesWeighted = makers.reduce(
      (acc, maker) => acc + maker.accruedFeesUsd ** FEE_WEIGHT,
      0
    );

    let i = 0;
    for (const maker of makers) {
      i++;
      const accruedFees = await getAccruedFees(poolAddress, maker.address);
      const percentOfTotalFees = Number(
        toFraction(maker.accruedFeesUsd)
          .divide(toFraction(totalFees))
          .toSignificant(6)
      );
      const makerScore = maker.accruedFeesUsd ** FEE_WEIGHT;

      for (const rewardToken of market.rewardTokens) {
        const totalRewards = BigInt(rewardToken.amount);
        const makerRewards = new Fraction(totalRewards)
          .multiply(toFraction(makerScore))
          .divide(toFraction(totalFeesWeighted));
        const rewardPercentage = makerRewards
          .multiply(100n)
          .divide(totalRewards);

        const parse = (token: PrismaToken, val: BigintIsh) =>
          Number(new TokenAmount(toToken(token), val).toSignificant(6));

        excelData.push({
          userAddress: maker.address,
          accruedFeesX: parse(token0, accruedFees.accruedFeesX),
          accruedFeesY: parse(token1, accruedFees.accruedFeesY),
          accruedFeesL: parse(token1, accruedFees.accruedFeesL),
          accruedFeesUsd: maker.accruedFeesUsd,
          percentOfTotalFees,
          pairAddress: poolAddress,
          makerScore,
          makerRank: i,
          rewardPercentage: Number(rewardPercentage.toSignificant(6)),
          rewardToken: rewardToken.token.symbol,
          makerRewards: Number(makerRewards.toSignificant(6)),
          makerRewardsRaw: makerRewards.quotient.toString(),
          pairName: token0.symbol + "_" + token1.symbol + "-" + binStep,
          rewardEpoch: epoch,
          rewardAmount: parse(rewardToken.token, totalRewards),
        });
      }
    }

    const rewards: RewardData[] = await Promise.all(
      market.rewardTokens.map(async (rewardToken) => {
        const totalRewards = BigInt(rewardToken.amount);
        return {
          totalRewards,
          address: rewardToken.address,
          length: makers.length,
          users: makers.map((maker) => {
            return {
              address: maker.address,
              amount: new Fraction(totalRewards)
                .multiply(toFraction(maker.accruedFeesUsd ** FEE_WEIGHT))
                .divide(toFraction(totalFeesWeighted)).quotient,
            };
          }),
        };
      })
    );

    jsonData.markets.push({
      address: poolAddress,
      epoch,
      start: to.getTime(),
      duration: 0,
      length: market.rewardTokens.length,
      rewards,
    });
    jsonData.length++;
  }

  saveFile(jsonData);
  saveXLSXFile(excelData);
})();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
