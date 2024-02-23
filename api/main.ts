import express from "express";
import cors from "cors";
import { appRouter, expressMiddleware } from "./src/trpc";
import {
  getBars,
  getConfig,
  getServerTime,
  resolveSymbol,
  searchSymbols,
} from "./src/tradingview";
import apicache from "apicache";
import { expressHandler } from "trpc-playground/handlers/express";

const cache = apicache.options({
  headers: {
    "cache-control": "no-cache",
  },
}).middleware;

const trpcApiEndpoint = "/trpc";
const playgroundEndpoint = "/trpc-playground";

const app = express();
app.use(cors());
app.use(cache("5 minutes"));
app.use(trpcApiEndpoint, expressMiddleware);

// Dev only
// app.use(
//   playgroundEndpoint,
//   await expressHandler({
//     trpcApiEndpoint,
//     playgroundEndpoint,
//     router: appRouter,
//   })
// );

// Health check
app.get("/", (req, res) => {
  console.log(req.ip);
  res.send("Hello World!");
});

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
  const from = parseInt(req.query.from as string);
  const to = parseInt(req.query.to as string);
  const countback = parseInt(req.query.countback as string);
  const history = await getBars(symbol, resolution, from, to, countback);
  res.send(history);
});
app.get("/time", (req, res) => {
  const time = getServerTime();
  res.send(time.toString()); // express doesnt allow sending numbers (could be interpreted as status code)
});

const port: number = parseInt(process.env.PORT || "3001");
app.listen(port);
console.log("Listening on port", port);

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
