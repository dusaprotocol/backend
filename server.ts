import express from "express";
import { web3Client } from "./src/client";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import { processEvents } from "./src/socket";
import { analyticsTask, autonomousEvents, priceTask } from "./src/crons";
import {
    EOperationStatus,
    ISubscribedFullBlocksMessage,
} from "@massalabs/massa-web3";
import {
    generateFullRequestName,
    WS_RPC_REQUEST_METHOD_BASE,
    WS_RPC_REQUEST_METHOD_NAME,
} from "./src/WsRpcMethods";
import { IFilledBlockInfo } from "@massalabs/massa-web3/dist/interfaces/ISubscribedFullBlocksMessage";
import WebSocket from "ws";
import { ICallSmartContractOpType } from "@massalabs/massa-web3/dist/interfaces/OperationTypes";

// Start TRPC server

const app = express();
app.use(cors());

app.get("/", (req, res) => {
    console.log(req.ip);
    res.send("Hello World!");
});

app.use("/trpc", expressMiddleware);

app.listen(3001);
console.log("Listening on port 3001");

// Start WS client

const wsClient = new WebSocket("ws://64.226.72.133:33036");

if (!wsClient) console.log("WS not available");
else {
    wsClient.onclose = () => {
        console.log("ws closed");
    };

    wsClient.onerror = (error) => {
        console.error("ws error", error);
    };

    wsClient.onmessage = (message) => {
        const data = JSON.parse(message.data as string);

        if ("params" in data) {
            const res = data.params.result as ISubscribedFullBlocksMessage;
            console.log(res.header.id, res.operations.length);
            res.operations.forEach((operation) => {
                const txId = operation[0];
                const op = (operation[1] as unknown as IFilledBlockInfo).content
                    .op;
                if ("CallSC" in op) {
                    const method = (op as ICallSmartContractOpType).CallSC
                        .target_func;
                    web3Client
                        .smartContracts()
                        .awaitRequiredOperationStatus(
                            txId,
                            EOperationStatus.FINAL
                        )
                        .then((status) => {
                            if (status !== EOperationStatus.FINAL) {
                                console.log(
                                    txId + " failed to reached final status"
                                );
                                return;
                            }

                            console.log(txId + " has reached final status");

                            web3Client
                                .smartContracts()
                                .getFilteredScOutputEvents({
                                    start: null,
                                    end: null,
                                    emitter_address: null,
                                    original_caller_address: null,
                                    is_final: null,
                                    original_operation_id: txId,
                                })
                                .then((events) =>
                                    processEvents(txId, method, events)
                                );
                        });
                }
            });
        }
    };

    wsClient.onopen = () => {
        console.log("ws open");
        wsClient.send(
            JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: generateFullRequestName(
                    WS_RPC_REQUEST_METHOD_BASE.SUBSCRIBE,
                    WS_RPC_REQUEST_METHOD_NAME.NEW_FILLED_BLOCKS
                ),
                params: [],
            })
        );
    };

    console.log("Connected to WS");
}

// Start cron tasks

priceTask.start();
analyticsTask.start();
autonomousEvents.start();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
    return Number(this);
};
