import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { Prisma } from "@prisma/client";
import { prisma } from "./../common/db";
import {
  getBinStep,
  getCallee,
  getPriceFromId,
  getTokenValue,
} from "./../common/methods";
import { getGenesisTimestamp, parseSlot } from "./../common/utils";
import logger from "../common/logger";

export const indexedMethods = [
  "swapExactTokensForTokens",
  "addLiquidity",
  "removeLiquidity",
];

// EVENT PROCESSING

export const processSwap = (
  txHash: string,
  timestamp: string | Date,
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  swapEvents: string[]
) => {
  getBinStep(poolAddress).then((binStep) => {
    if (!binStep) return;

    let binId = 0;
    let price = 0;
    let swapForY = false;
    let amountIn = 0;
    let amountOut = 0;
    let totalFees = 0;

    swapEvents.forEach((event) => {
      const [
        to,
        _binId,
        _swapForY,
        _amountIn,
        _amountOut,
        volatilityAccumulated,
        _totalFees,
      ] = event.split(",");

      binId = Number(_binId);
      price = getPriceFromId(binId, binStep);
      swapForY = _swapForY === "true";
      amountIn += Number(_amountIn);
      amountOut += Number(_amountOut);
      totalFees += Number(_totalFees);
    });

    getTokenValue(tokenIn).then((valueIn) => {
      if (!valueIn) return;

      const volume = Math.round((amountIn / 10 ** 9) * valueIn);
      const fees = Math.round((totalFees / 10 ** 9) * valueIn * 100); // fees are stored in cents
      addVolume(poolAddress, volume, fees);
    });
    addPrice(poolAddress, price);

    amountIn += totalFees;
    prisma.swap
      .create({
        data: {
          poolAddress,
          swapForY,
          binId,
          amountIn,
          amountOut,
          timestamp,
          txHash,
        },
      })
      .then((e) => logger.info(e))
      .catch((e) => logger.warn(e));
  });
};

export const processLiquidity = (
  poolAddress: string,
  events: string[],
  isAddLiquidity: boolean
) => {
  getBinStep(poolAddress).then((binStep) => {
    if (!binStep) return;

    let amountX = 0;
    let amountY = 0;

    events.forEach((event) => {
      const [to, _binId, _amountX, _amountY] = event.split(",");

      amountX += Number(_amountX);
      amountY += Number(_amountY);
    });

    addTvl(
      poolAddress,
      isAddLiquidity ? amountX : -amountX,
      isAddLiquidity ? amountY : -amountY,
      new Date()
    );
  });
};

export const processEvents = (
  txId: string,
  method: string,
  events: IEvent[]
) => {
  logger.info(
    txId,
    method,
    events.map((e) => e.data)
  );
  if (
    !events.length ||
    events[events.length - 1].data.includes("massa_execution_error")
  )
    return;

  const genesisTimestamp = getGenesisTimestamp();
  const timestamp = parseSlot(events[0].context.slot, genesisTimestamp);
  switch (method) {
    case "swap":
    case "swapExactTokensForTokens": {
      const pairAddress = events[0].data.split(",")[1];
      const tokenIn = getCallee(events[0]);
      const tokenOut = getCallee(events[events.length - 1]);
      processSwap(
        txId,
        new Date(timestamp),
        pairAddress,
        tokenIn,
        tokenOut,
        events.map((e) => e.data).filter((e) => e.startsWith("SWAP:"))
      );
      break;
    }
    case "addLiquidity":
    case "removeLiquidity": {
      const isAdd = method === "addLiquidity";
      const pairAddress = events[0].data.split(",")[isAdd ? 1 : 2];

      processLiquidity(
        pairAddress,
        events
          .map((e) => e.data)
          .filter(
            (e) =>
              e.startsWith("DEPOSITED_TO_BIN:") ||
              e.startsWith("WITHDRAWN_FROM_BIN:")
          ),
        isAdd
      );
    }
  }
};

// COMMON PRISMA ACTIONS

export const addVolume = (address: string, volume: number, fees: number) => {
  const date = new Date();
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.analytics
    .upsert({
      where: {
        date_address: {
          address,
          date,
        },
      },
      update: {
        volume: {
          increment: volume,
        },
        fees: {
          increment: fees,
        },
      },
      create: {
        address,
        date,
        volume,
        fees,
        token0Locked: 0,
        token1Locked: 0,
      },
    })
    .then((e) => logger.info(e))
    .catch((err) => logger.warn(err));
};

export const addTvl = (
  address: string,
  token0Locked: number,
  token1Locked: number,
  date: Date = new Date()
) => {
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.analytics
    .upsert({
      where: {
        date_address: {
          address,
          date,
        },
      },
      update: {
        token0Locked: {
          increment: token0Locked,
        },
        token1Locked: {
          increment: token1Locked,
        },
      },
      create: {
        address,
        date,
        volume: 0,
        fees: 0,
        token0Locked,
        token1Locked,
      },
    })
    .then((e) => logger.info(e))
    .catch((err) => logger.warn(err));
};

export const addPrice = (address: string, price: number) => {
  const date = new Date();
  date.setHours(date.getHours(), 0, 0, 0);

  prisma.price
    .findUnique({
      where: {
        date_address: {
          address,
          date,
        },
      },
    })
    .then((curr) => {
      if (!curr) {
        prisma.price
          .create({
            data: {
              address,
              open: price,
              high: price,
              low: price,
              close: price,
              date,
            },
          })
          .then((e) => logger.info(e))
          .catch((err) => logger.warn(err));
        return;
      }

      const data: Prisma.PriceUpdateInput = {
        close: price,
      };
      if (price > curr.high) data.high = price;
      if (price < curr.low) data.low = price;

      prisma.price
        .update({
          where: {
            date_address: {
              address,
              date,
            },
          },
          data,
        })
        .then((e) => logger.info(e))
        .catch((err) => logger.warn(err));
    })
    .catch((err) => logger.warn(err));
};
