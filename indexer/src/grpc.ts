import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import logger from "../../common/logger";
import { ONE_MINUTE } from "../../common/utils";
import {
  NewSlotExecutionOutputsRequest,
  NewOperationsRequest,
} from "../gen/ts/massa/api/v1/public";
import { PublicServiceClient as MassaServiceClient } from "../gen/ts/massa/api/v1/public.client";
import { ExecutionOutputStatus } from "../gen/ts/massa/model/v1/execution";
import { handleNewOperations, handleNewSlotExecutionOutputs } from "./helpers";
import { RpcOptions, DuplexStreamingCall } from "@protobuf-ts/runtime-rpc";

const grpcDefaultHost = "buildnet-explorer.massa.net";
const grpcPort = 33037;

const createClient = (host: string = grpcDefaultHost) =>
  new MassaServiceClient(
    new GrpcTransport({
      host: `${host}:${grpcPort}`,
      channelCredentials: ChannelCredentials.createInsecure(),
    })
  );

const baseClient = createClient();

type ExtractFunctionKeys<T> = {
  [P in keyof T]-?: T[P] extends (...args: any[]) => DuplexStreamingCall
    ? P
    : never;
}[keyof T];
type ClientActions = ExtractFunctionKeys<MassaServiceClient>;

const subscribe = async (
  client: MassaServiceClient,
  method: ClientActions,
  req: any,
  handler: (message: any) => Promise<void>
  // TODO: replace 'any'
) => {
  const stream = client[method]();
  stream.requests.send(req);

  logger.info(`${method}:${new Date().toString()}`);

  for await (let message of stream.responses) {
    handler(message).catch((err: Error) => {
      logger.warn(err.message);
      logger.warn(err.stack);
    });
  }

  // TODO: catch connection error
  // setTimeout(() => subscribe(client, method, req, handler), ONE_MINUTE);

  return stream;
};

export const subscribeNewSlotExecutionOutputs = async () => {
  const req: NewSlotExecutionOutputsRequest = {
    filters: [
      {
        filter: {
          oneofKind: "status",
          status: ExecutionOutputStatus.CANDIDATE,
        },
      },
    ], // TODO: add filters
  };

  return subscribe(
    baseClient,
    "newSlotExecutionOutputs",
    req,
    handleNewSlotExecutionOutputs
  );
};

export const subscribeNewOperations = async () => {
  const req: NewOperationsRequest = {
    filters: [], // TODO: add filters
  };

  return subscribe(baseClient, "newOperations", req, handleNewOperations);
};
