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
      const events = message.output?.executionOutput?.events;
      if (!events) return;

      console.log("--------------------");
      events.forEach(async (event) => {
        if (!event.context) return;

        const { callStack } = event.context;
        if (callStack.includes(dcaSC)) {
          const swapEvent = events.find((e) => e.data.startsWith("SWAP:"));
          if (!swapEvent) return;

          const amountOut = parseInt(swapEvent.data.split(",")[1]);
          console.log(swapEvent?.data);
          console.log(message.output?.executionOutput?.stateChanges);

          if (event.data.startsWith("DCA_EXECUTED:")) {
            // DCA_EXECUTED:owner,id
            const owner = event.data.split(":")[1].split(",")[0];
            const id = parseInt(event.data.split(":")[1].split(",")[1]);
            await prisma.dCAExecution.create({
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
            });
          }
        } else if (callStack.includes(orderSC)) {
        } else if (
          callStack.includes(routerSC) &&
          getCallee(callStack) !== routerSC
        ) {
          console.log(event);
        } else return;
      });
      console.log("--------------------");
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
