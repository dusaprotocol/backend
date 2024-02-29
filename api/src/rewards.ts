import { Prisma } from "@prisma/client";
import { prisma } from "../../common/db";
import { writeFile } from "fs";
import { Fraction } from "@dusalabs/sdk";
import { ONE_DAY } from "../../common/utils";
import { toFraction } from "../../common/methods";

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

type Data = {
  length: number;
  markets: MarketData[];
};

const FEE_WEIGHT = 0.7;

const generateJSON = async (
  market: Prisma.RewardPoolGetPayload<{ include: { rewardTokens: true } }>,
  epoch: number,
  from: Date,
  to: Date
): Promise<MarketData> => {
  const { poolAddress } = market;
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
      return makers.map((maker) => {
        return {
          address: maker.address,
          volume: maker._sum.volume || 0,
          accruedFeesUsd: maker._sum.accruedFeesUsd || 0,
        };
      });
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

  const rewards: RewardData[] = market.rewardTokens.map((rewardToken) => {
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
  });

  return {
    address: poolAddress,
    epoch,
    start: from.getTime(),
    duration: 0,
    length: market.rewardTokens.length,
    rewards,
  };
};

const saveFile = async (data: {}) => {
  writeFile("dataset.json", JSON.stringify(data), (err) => {
    if (err) {
      console.error(err);
    }
  });
};

(async () => {
  const epoch = 1;
  const from = new Date(Date.now() - ONE_DAY * 7);
  const to = new Date();

  const data: Data = {
    length: 0,
    markets: [],
  };

  const markets = await prisma.rewardPool.findMany({
    include: {
      rewardTokens: true,
    },
    where: {
      epoch,
    },
  });
  for (const market of markets) {
    const marketData = await generateJSON(market, epoch, from, to);
    data.markets.push(marketData);
    data.length++;
  }

  await saveFile(data);
})();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
