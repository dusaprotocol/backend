import express from "express";
import { web3Client } from "./src/client";
import { IFilledBlockInfo } from "@massalabs/massa-web3/dist/interfaces/ISubscribedFullBlocksMessage";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import { EOperationStatus } from "@massalabs/massa-web3";

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
        block.operations.forEach(async (operation) => {
            await web3Client
                .smartContracts()
                .awaitRequiredOperationStatus(operation[0], EOperationStatus.INCLUDED_PENDING);
            const op = (operation[1] as unknown as IFilledBlockInfo).content.op;
            // console.log(op);
            web3Client
                .smartContracts()
                .getFilteredScOutputEvents({
                    start: null,
                    end: null,
                    emitter_address: null,
                    original_caller_address: null,
                    is_final: null,
                    original_operation_id: operation[0],
                })
                .then((events) => {
                    console.log(events);
                });
            // if ("CallSC" in op) {
            //     const args = new Args((op as ICallSmartContractOpType).CallSC.param);
            //     console.log(args.nextString());
            //     console.log(args.nextU64().toString());
            // }
        });
    });
}
