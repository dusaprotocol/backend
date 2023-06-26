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

// Start TRPC server

const app = express();
app.use(cors());
app.use("/trpc", expressMiddleware);

// Health check
app.get("/", (req, res) => {
  console.log(req.ip);
  res.send("Hello World!");
});

app.get("/config", (req, res) => {
  const config = getConfig();
  res.send(config);
});
app.get("/symbols", (req, res) => {
  const symbol = req.query.symbol as string;
  const symbolInfo = resolveSymbol(symbol);
  res.send(symbolInfo);
});
app.get("/search", (req, res) => {
  const searchResults = searchSymbols();
  res.send(searchResults);
});
app.get("/history", async (req, res) => {
  const symbol = req.query.symbol as string;
  const resolution = req.query.resolution as string;
  const from = parseInt(req.query.from as string);
  const to = parseInt(req.query.to as string);
  const countback = parseInt(req.query.countback as string);
  const history = await getBars(symbol, resolution, from, to, countback);
  res.send(history);
});
app.get("/time", (req, res) => {
  const time = getServerTime();
  res.send(time);
});

app.listen(3001);
console.log("Listening on port 3001");

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
