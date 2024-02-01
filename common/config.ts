import { ChainId } from "@dusalabs/sdk";
import dotenv from "dotenv";
dotenv.config({ path: "../.env" }); // loads env variables

if (
  !process.env.CHAIN_ID ||
  !process.env.CHAIN_URL ||
  !process.env.GRPC_HOST ||
  !process.env.GRPC_PORT
)
  throw new Error("environment variables not set");

export const CHAIN_URL = process.env.CHAIN_URL;
export const CHAIN_ID = Number(process.env.CHAIN_ID) as ChainId;

export const grpcDefaultHost = process.env.GRPC_HOST;
export const grpcPort = Number(process.env.GRPC_PORT);
