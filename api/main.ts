import express from "express";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import {
  getBars,
  getConfig,
  getServerTime,
  resolveSymbol,
  searchSymbols,
} from "./src/tradingview";
import { getTickers } from "./src/coingecko";
import apicache from "apicache";

const cache = apicache.options({
  headers: {
    "cache-control": "no-cache",
  },
}).middleware;

const app = express();
app.use(cors());
app.use(cache("1 minute"));
app.use("/trpc", expressMiddleware);

// Health check
app.get("/", (req, res) => {
  console.log(req.ip);
  res.send("Hello World!");
});

// ========================================
//               TRADING VIEW            //
// ========================================

app.get("/config", (req, res) => {
  const config = getConfig();
  res.send(config);
});
app.get("/symbols", async (req, res) => {
  const symbol = req.query.symbol as string;
  const symbolInfo = await resolveSymbol(symbol);
  res.send(symbolInfo);
});
app.get("/search", (req, res) => {
  const searchResults = searchSymbols();
  res.send(searchResults);
});
app.get("/history", async (req, res) => {
  const symbol = req.query.symbol as string;
  const resolution = req.query.resolution as string;
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  const countback = Number(req.query.countback);
  const history = await getBars({ symbol, resolution, from, to, countback });
  res.send(history);
});
app.get("/time", (req, res) => {
  const time = getServerTime();
  res.send(time.toString()); // express doesnt allow sending numbers (could be interpreted as status code)
});

// ========================================
//                COINGECKO              //
// ========================================

app.get("/tickers", async (req, res) => {
  const tickers = await getTickers();
  res.send(tickers);
});

const port: number = parseInt(process.env.PORT || "3001");
app.listen(port);
console.log("Listening on port", port);

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): string {
  return this.toString();
};
