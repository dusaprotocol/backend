import { prisma } from "../../common/db";

interface BarsData {
  t: number[];
  o: number[];
  c: number[];
  h: number[];
  l: number[];
}
interface BarsResponse extends BarsData {
  s: "ok" | "no_data" | "error";
}

const supported_resolutions = ["60", "120", "240"];

// Data feed configuration data
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#data-feed-configuration-data
export const getConfig = () => {
  return {
    supported_resolutions,
    supports_group_request: false,
    supports_marks: false,
    supports_search: true,
    supports_timescale_marks: false,
  };
};

// Symbol resolve
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#symbol-resolve
export const resolveSymbol = (symbol: string) => {
  return {
    name: symbol,
    full_name: symbol,
    // base_name: [symbol],
    // ticker: symbol,
    description: symbol,
    type: "crypto",
    session: "24x7",
    exchange: "Dusa",
    listed_exchange: "Dusa",
    timezone: "Etc/UTC",
    format: "price",
    pricescale: 10 ** 9,
    minmov: 1,
    has_empty_bars: true,
    has_intraday: true,
    intraday_multipliers: ["60"],
    supported_resolutions,
  };
};

// Symbol search
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#symbol-search
export const searchSymbols = () => {
  return [];
};

// Bars
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#bars
export const getBars = async (
  symbol: string,
  resolution: string,
  from: number,
  to: number,
  countback: number
) => {
  const interval = (to - from) / countback;
  console.log({ symbol, resolution, from, to, countback, interval });

  const prices = await prisma.price.findMany({
    where: {
      address: symbol,
      date: {
        gte: new Date(from * 1000),
        lte: new Date(to * 1000),
      },
    },
    orderBy: {
      date: "desc",
    },
    take: countback,
  });
  const len = prices.length;
  if (len === 0) {
    return {
      s: "no_data",
    };
  }

  const newPrices: BarsData = {
    t: Array.from({ length: len }, () => 0),
    o: Array.from({ length: len }, () => 0),
    c: Array.from({ length: len }, () => 0),
    h: Array.from({ length: len }, () => 0),
    l: Array.from({ length: len }, () => 0),
  };
  for (let i = prices.length - 1; i >= 0; i--) {
    const price = prices[i];
    const index = len - (i + 1); //countback - (len - i);
    newPrices.t[index] = price.date.getTime() / 1000;
    newPrices.o[index] = price.open;
    newPrices.c[index] = price.close;
    newPrices.h[index] = price.high;
    newPrices.l[index] = price.low;
  }

  return {
    ...newPrices,
    s: "ok",
  };
};

// Server time
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#server-time
export const getServerTime = () => {
  return Math.floor(Date.now() / 1000);
};
