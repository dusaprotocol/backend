import express from "express";
import { web3Client } from "./src/client";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import { processLiquidity, processSwap } from "./src/socket";
import { analyticsTask, priceTask } from "./src/crons";
import { EOperationStatus } from "@massalabs/massa-web3";

// Start TRPC server

const app = express();
app.use(cors());

app.get("/", (req, res) => {
    console.log(req.ip);
    res.send("Hello World!");
});
app.get("/tx/:txId/:method", async (req, res) => {
    const txId = req.params.txId;
    const method = req.params.method;

    console.log({ txId, method });

    web3Client
        .smartContracts()
        .awaitRequiredOperationStatus(txId, EOperationStatus.FINAL)
        .then((status) => {
            if (status !== EOperationStatus.FINAL) return;

            console.log(txId + "has reached final status");

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
                        const pairAddress = events[0].data.split(",")[1];
                        const tokenIn = events[0].data.split(":")[0];
                        const tokenOut =
                            events[events.length - 1].data.split(":")[0];
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
                            events[0].data.split(",")[isAdd ? 1 : 2];

                        processLiquidity(
                            pairAddress,
                            tokenX,
                            tokenY,
                            events
                                .map((e) => e.data)
                                .filter(
                                    (e) =>
                                        e.startsWith("DEPOSITED_TO_BIN:") ||
                                        e.startsWith("WITHDRAWN_FROM_BIN:")
                                ),
                            isAdd
                        );
                    } else return;
                });
        })
        .catch((e) => console.log(e));

    res.send("OK");
});

app.use("/trpc", expressMiddleware);

app.listen(3001);
console.log("Listening on port 3001");

// Start cron tasks

priceTask.start();
analyticsTask.start();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
    return Number(this);
};
