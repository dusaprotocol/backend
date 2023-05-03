import express from "express";
import { web3Client } from "./src/client";
import { IFilledBlockInfo } from "@massalabs/massa-web3/dist/interfaces/ISubscribedFullBlocksMessage";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import { EOperationStatus, WebsocketEvent } from "@massalabs/massa-web3";
import { processLiquidity, processSwap } from "./src/socket";
import { ICallSmartContractOpType } from "@massalabs/massa-web3/dist/interfaces/OperationTypes";
import { analyticsTask, priceTask } from "./src/crons";

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

// Start cron tasks

priceTask.start();
analyticsTask.start();

// Start WS client

const wsClient = web3Client.ws();
if (!wsClient) console.log("WS not available");
else {
    wsClient.on(WebsocketEvent.ON_CLOSED, () => {
        console.log("ws closed");
    });

    wsClient.on(WebsocketEvent.ON_CLOSING, () => {
        console.log("ws closing");
    });

    wsClient.on(WebsocketEvent.ON_CONNECTING, () => {
        console.log("ws connecting");
    });

    wsClient.on(WebsocketEvent.ON_OPEN, () => {
        console.log("ws open");
    });

    wsClient.on(WebsocketEvent.ON_PING, () => {
        console.log("ws ping", Date.now());
    });

    wsClient.on(WebsocketEvent.ON_ERROR, (errorMessage) => {
        console.error("ws error", errorMessage);
    });

    await wsClient.connect();
    console.log("Connected to WS");

    wsClient.subscribeFilledBlocks(async (block) => {
        console.log(block.header.id, block.operations.length);
        block.operations.forEach(async (operation) => {
            const txId = operation[0];
            console.log(txId);
            const op = (operation[1] as unknown as IFilledBlockInfo).content.op;
            if ("CallSC" in op) {
                const method = (op as ICallSmartContractOpType).CallSC
                    .target_func;

                web3Client
                    .smartContracts()
                    .awaitRequiredOperationStatus(txId, EOperationStatus.FINAL)
                    .then((status) => {
                        if (status !== EOperationStatus.FINAL) return;

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
                            .then((events) => {
                                if (
                                    events[events.length - 1].data.includes(
                                        "massa_execution_error"
                                    )
                                )
                                    return;

                                const timestamp = new Date(); // events[0].context.slot;
                                if (method === "swapExactTokensForTokens") {
                                    const pairAddress =
                                        events[0].data.split(",")[1];
                                    const tokenIn =
                                        events[0].data.split(":")[0];
                                    const tokenOut =
                                        events[events.length - 1].data.split(
                                            ":"
                                        )[0];
                                    processSwap(
                                        txId,
                                        timestamp,
                                        pairAddress,
                                        tokenIn,
                                        tokenOut,
                                        events.slice(1, -1).map((e) => e.data)
                                    );
                                } else if (
                                    method === "addLiquidity" ||
                                    method === "removeLiquidity"
                                ) {
                                    const isAdd = method === "addLiquidity";

                                    const tokenX = ""; //getCallee(events[0]);
                                    const tokenY = ""; // getCallee(events[1]);
                                    const pairAddress =
                                        events[0].data.split(",")[
                                            isAdd ? 1 : 2
                                        ];

                                    processLiquidity(
                                        pairAddress,
                                        tokenX,
                                        tokenY,
                                        events
                                            .map((e) => e.data)
                                            .filter(
                                                (e) =>
                                                    e.startsWith(
                                                        "DEPOSITED_TO_BIN:"
                                                    ) ||
                                                    e.startsWith(
                                                        "WITHDRAWN_FROM_BIN:"
                                                    )
                                            ),
                                        isAdd
                                    );
                                } else return;
                            });
                    });
            }
        });
    });
}

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
    return Number(this);
};
