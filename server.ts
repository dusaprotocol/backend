import express from "express";
import { web3Client } from "./src/client";
import { IFilledBlockInfo } from "@massalabs/massa-web3/dist/interfaces/ISubscribedFullBlocksMessage";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import { EOperationStatus } from "@massalabs/massa-web3";
import { processSwap } from "./src/socket";
import { ICallSmartContractOpType } from "@massalabs/massa-web3/dist/interfaces/OperationTypes";

// Start TRPC server

const app = express();
app.use(cors());
app.use("/trpc", expressMiddleware);
app.listen(3001);
console.log("Listening on port 3001");

// Start WS client

const wsClient = web3Client.ws();
if (!wsClient) console.log("WS not available");
else {
    await wsClient.connect();
    console.log("Connected to WS");

    wsClient.subscribeFilledBlocks(async (block) => {
        console.log(block.header.id, block.operations.length);
        block.operations.forEach(async (operation) => {
            const txId = operation[0];
            await web3Client
                .smartContracts()
                .awaitRequiredOperationStatus(txId, EOperationStatus.FINAL);

            const op = (operation[1] as unknown as IFilledBlockInfo).content.op;
            if ("CallSC" in op) {
                const method = (op as ICallSmartContractOpType).CallSC
                    .target_func;

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
                    .then(async (events) => {
                        if (
                            events[events.length - 1].data.includes(
                                "massa_execution_error"
                            )
                        )
                            return;

                        console.log(
                            events.map((e) => e.data),
                            method
                        );
                        const call_stack = events[0].context.call_stack;
                        const caller = call_stack[0];
                        const callee = call_stack[call_stack.length - 1];
                        const timestamp = new Date(); // events[0].context.slot;
                        if (method === "swapExactTokensForTokens") {
                            const pairAddress = events[0].data.split(",")[1];
                            await processSwap(
                                txId,
                                timestamp,
                                pairAddress,
                                events.slice(1, -1).map((e) => e.data)
                            );
                        }
                        // else if (method === "addLiquidity") {
                        //     processAddLiquidity()
                        // }
                    });
            }
        });
    });
}

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
    return Number(this);
};
