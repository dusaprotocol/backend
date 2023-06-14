import express from "express";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import logger from "../indexer/common/logger";

// Start TRPC server

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  logger.silly(req.ip);
  res.send("Hello World!");
});

app.use("/trpc", expressMiddleware);

app.listen(3001);
console.debug("Listening on port 3001");

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
  return Number(this);
};
