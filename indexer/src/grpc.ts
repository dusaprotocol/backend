import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { dcaSC, orderSC, routerSC } from "../../common/contracts";
import logger from "../../common/logger";
import { getCallee } from "../../common/methods";
import { ONE_MINUTE } from "../../common/utils";
import {
  NewSlotExecutionOutputsRequest,
  NewOperationsRequest,
} from "../gen/ts/massa/api/v1/public";
import { PublicServiceClient as MassaServiceClient } from "../gen/ts/massa/api/v1/public.client";
import { ExecutionOutputStatus } from "../gen/ts/massa/model/v1/execution";
import { processOperation } from "./helpers";
import { prisma } from "../../common/db";
import { EventDecoder } from "@dusalabs/sdk";
import { bytesToStr } from "@massalabs/massa-web3";

const grpcDefaultHost = "buildnet-explorer.massa.net";
const grpcPort = 33037;

export const subscribeNewSlotExecutionOutputs = async (
  host: string = grpcDefaultHost
) => {
  const baseUrl = `${host}:${grpcPort}`;
  const transport = new GrpcTransport({
    host: baseUrl,
    channelCredentials: ChannelCredentials.createInsecure(),
  });
  const service = new MassaServiceClient(transport);
  const stream = service.newSlotExecutionOutputs();
  const req: NewSlotExecutionOutputsRequest = {
    filters: [
      {
        filter: {
          oneofKind: "status",
          status: ExecutionOutputStatus.CANDIDATE,
        },
      },
      // {
      //   filter: {
      //     status: ExecutionOutputStatus.CANDIDATE,
      //     oneofKind: "status",
      //   },
      // },
    ], // TODO: add filters
  };
  stream.requests.send(req);

  logger.info(
    `[${baseUrl}] subscribeNewSlotExecutionOutputs start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      console.log(message.output?.executionOutput?.slot);
      // const stateChanges = message.output?.executionOutput?.stateChanges

      const events = message.output?.executionOutput?.events;
      if (!events) return;

      events.forEach(async (event) => {
        if (!event.context) return;

        const { callStack } = event.context;
        if (callStack.includes(dcaSC)) {
          // handle inner swap
          const swapEvent = events.find((e) =>
            bytesToStr(e.data).startsWith("SWAP:")
          );
          if (!swapEvent) return;
          console.log(swapEvent?.data);

          // handle dca execution
          if (bytesToStr(event.data).startsWith("DCA_EXECUTED:")) {
            const [owner, _id, _amountOut] = bytesToStr(event.data)
              .split(":")[1]
              .split(",");
            const id = parseInt(_id);
            const amountOut = EventDecoder.decodeU256(_amountOut);
            console.log("DCA_EXECUTED", owner, id, amountOut);

            // TODO: fetch DCA from datastore if its not already in the db

            prisma.dCAExecution
              .create({
                data: {
                  amountIn: 0,
                  amountOut: 0,
                  id,
                  txHash: "",
                  timestamp: new Date(),
                  DCA: {
                    connect: {
                      id,
                    },
                  },
                },
              })
              .then(console.log)
              .catch((e) => console.log(JSON.stringify(e)));
          }
        } else if (callStack.includes(orderSC)) {
        } else return;
      });
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(
      () => subscribeNewSlotExecutionOutputs(grpcDefaultHost),
      ONE_MINUTE
    );
  }
};

export const subscribeNewOperations = async (
  host: string = grpcDefaultHost
) => {
  const baseUrl = `${host}:${grpcPort}`;
  const transport = new GrpcTransport({
    host: baseUrl,
    channelCredentials: ChannelCredentials.createInsecure(),
  });
  const service = new MassaServiceClient(transport);
  const stream = service.newOperations();
  const req: NewOperationsRequest = {
    filters: [], // TODO: add filters
  };
  stream.requests.send(req);

  logger.info(
    `[${baseUrl}] subscribeNewOperations start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      console.log(message);
      const txId = message.signedOperation?.secureHash;
      const caller = message.signedOperation?.contentCreatorAddress;
      const content = message.signedOperation?.content;
      if (!txId || !caller || !content) return;
      processOperation(content, caller, txId);
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(() => subscribeNewOperations(grpcDefaultHost), ONE_MINUTE);
  }
};
