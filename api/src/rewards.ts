import { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import { writeFile } from "fs";
import { Fraction, Token, TokenAmount } from "@dusalabs/sdk";
import { ONE_DAY } from "../../common/utils";
import { toFraction, toToken } from "../../common/methods";
import xlsx from "node-xlsx";
import { CHAIN_ID } from "../../common/config";

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
  season: string;
  chain: string;
  pairName: string;
  pid: string;
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
const from = new Date(Date.now() - ONE_DAY * 7);
const to = new Date();

// SAVE FILE

const saveFile = (data: {}) =>
  writeFile(
    "dataset.json",
    JSON.stringify(data),
    (err) => err && console.error(err)
  );

const saveXLSXFile = (rawData: ExcelData[]) => {
  const data = rawData.map((row) => {
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
      row.season,
      row.chain,
      row.pairName,
      row.pid,
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
      .then((makers) => {
        return (
          makers
            .map((maker) => {
              return {
                address: maker.address,
                volume: maker._sum.volume || 0,
                accruedFeesUsd: maker._sum.accruedFeesUsd || 0,
              };
            })
            // sort by accruedFeesUsd desc
            .sort((a, b) => b.accruedFeesUsd - a.accruedFeesUsd)
        );
      });

    const totalVolume = makers.reduce((acc, maker) => acc + maker.volume, 0);
    const totalFees = makers.reduce(
      (acc, maker) => acc + maker.accruedFeesUsd,
      0
    );
    const totalFeesWeighted = makers.reduce(
      (acc, maker) => acc + maker.accruedFeesUsd ** FEE_WEIGHT,
      0
    );

    const rewards: RewardData[] = await Promise.all(
      market.rewardTokens.map(async (rewardToken) => {
        console.log(rewardToken);
        const totalRewards = BigInt(rewardToken.amount);

        makers.forEach(async (maker, i) => {
          const accruedFees = await prisma.maker
            .findMany({
              where: {
                poolAddress,
                date: {
                  gte: from,
                  lt: to,
                },
                address: maker.address,
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
          const percentOfTotalFees = Number(
            toFraction(maker.accruedFeesUsd)
              .divide(toFraction(totalFees))
              .toSignificant(6)
          );
          const makerScore = maker.accruedFeesUsd ** FEE_WEIGHT;
          const makerRewards = new Fraction(totalRewards)
            .multiply(toFraction(maker.accruedFeesUsd ** FEE_WEIGHT))
            .divide(toFraction(totalFeesWeighted));
          const rewardPercentage = makerRewards
            .multiply(100n)
            .divide(totalRewards);

          excelData.push({
            userAddress: maker.address,
            accruedFeesX: Number(
              new TokenAmount(
                toToken(token0),
                accruedFees.accruedFeesX
              ).toSignificant()
            ),
            accruedFeesY: Number(
              new TokenAmount(
                toToken(token1),
                accruedFees.accruedFeesY
              ).toSignificant()
            ),
            accruedFeesL: Number(
              new TokenAmount(
                toToken(token1),
                accruedFees.accruedFeesL
              ).toSignificant()
            ),
            accruedFeesUsd: maker.accruedFeesUsd,
            percentOfTotalFees,
            pairAddress: poolAddress,
            makerScore,
            makerRank: i + 1,
            rewardPercentage: Number(rewardPercentage.toSignificant(6)),
            rewardToken: rewardToken.address,
            makerRewards: Number(makerRewards.toSignificant(6)),
            makerRewardsRaw: makerRewards.quotient.toString(),
            season: "1",
            chain: CHAIN_ID.toString(),
            pairName: token0.symbol + "_" + token1.symbol + "-" + binStep,
            pid: "1",
            rewardEpoch: epoch,
            rewardAmount: Number(
              new TokenAmount(
                toToken(rewardToken.token),
                totalRewards
              ).toSignificant()
            ),
          });
        });

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
      start: from.getTime(),
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
