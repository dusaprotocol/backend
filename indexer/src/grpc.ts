import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { dcaSC, orderSC, routerSC } from "../../common/contracts";
import logger from "../../common/logger";
import { getCallee } from "../../common/methods";
import { ONE_MINUTE } from "../../common/utils";
import {
  NewSlotExecutionOutputsRequest,
  NewOperationsRequest,
  OpType,
} from "../gen/ts/massa/api/v1/api";
import { MassaServiceClient } from "../gen/ts/massa/api/v1/api.client";
import { ExecutionOutputStatus } from "../gen/ts/massa/model/v1/execution";
import { processOperation } from "./helpers";
import { prisma } from "../../common/db";
import { EventDecoder } from "@dusalabs/sdk";

const grpcDefaultHost = "37.187.156.118";
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
    id: "1",
    query: {
      filter: {
        status: [ExecutionOutputStatus.FINAL],
      },
    },
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
          const swapEvent = events.find((e) => e.data.startsWith("SWAP:"));
          if (!swapEvent) return;
          console.log(swapEvent?.data);

          // handle dca execution
          if (event.data.startsWith("DCA_EXECUTED:")) {
            // DCA_EXECUTED:owner,id
            const eventParams = event.data.split(":")[1].split(",");
            const owner = eventParams[0];
            const id = parseInt(eventParams[1]);
            const amountOut = 1; // EventDecoder.decodeU256(eventParams[2]);
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
              .catch(console.log);
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
    id: "1",
    query: {
      filter: {
        types: [OpType.CALL_SC],
      },
    },
  };
  stream.requests.send(req);

  logger.info(
    `[${baseUrl}] subscribeNewOperations start on ${new Date().toString()}`
  );

  try {
    for await (let message of stream.responses) {
      const txId = message.operation?.id;
      const caller = message.operation?.contentCreatorAddress;
      const content = message.operation?.content;
      if (!txId || !caller || !content) return;
      processOperation(content, caller, txId);
    }
  } catch (err: any) {
    logger.error(err.message);
    setTimeout(() => subscribeNewOperations(grpcDefaultHost), ONE_MINUTE);
  }
};
