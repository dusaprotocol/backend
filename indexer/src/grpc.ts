import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import logger from "../../common/logger";
import {
  NewSlotExecutionOutputsRequest,
  NewOperationsRequest,
  NewFilledBlocksRequest,
} from "../gen/ts/massa/api/v1/public";
import { PublicServiceClient as MassaServiceClient } from "../gen/ts/massa/api/v1/public.client";
import { ExecutionOutputStatus } from "../gen/ts/massa/model/v1/execution";
import {
  handleNewFilledBlocks,
  handleNewOperations,
  handleNewSlotExecutionOutputs,
} from "./helpers";
import { DuplexStreamingCall } from "@protobuf-ts/runtime-rpc";
import { grpcDefaultHost, grpcPort } from "../../common/config";
import { OpType } from "../gen/ts/massa/model/v1/operation";

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
  method: ClientActions,
  req: any,
  handler: (message: any) => Promise<void>
) => {
  const stream = baseClient[method]();
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
    ],
  };

  return subscribe(
    "newSlotExecutionOutputs",
    req,
    handleNewSlotExecutionOutputs
  );
};

export const subscribeNewOperations = async () => {
  const req: NewOperationsRequest = {
    filters: [
      {
        filter: {
          oneofKind: "operationTypes",
          operationTypes: {
            opTypes: [OpType.CALL_SC, OpType.EXECUTE_SC],
          },
        },
      },
    ],
  };

  return subscribe("newOperations", req, handleNewOperations);
};

export const subscribeNewFilledBlocks = async () => {
  const req: NewFilledBlocksRequest = {
    filters: [],
  };

  return subscribe("newFilledBlocks", req, handleNewFilledBlocks);
};
