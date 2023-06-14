import express from "express";
// import { web3Client } from "./src/client";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
// import { processEvents } from "./src/socket";
// import { analyticsTask, autonomousEvents, priceTask } from "./src/crons";
// import {
//     EOperationStatus,
//     ISubscribedFullBlocksMessage,
// } from "@massalabs/massa-web3";
// import {
//     generateFullRequestName,
//     WS_RPC_REQUEST_METHOD_BASE,
//     WS_RPC_REQUEST_METHOD_NAME,
// } from "./src/WsRpcMethods";
// import { IFilledBlockInfo } from "@massalabs/massa-web3/dist/interfaces/ISubscribedFullBlocksMessage";
// import WebSocket from "ws";
// import { ICallSmartContractOpType } from "@massalabs/massa-web3/dist/interfaces/OperationTypes";
// import { prisma } from "./src/db";

// Start TRPC server

const app = express();
app.use(cors());
app.get("/", (req, res) => {
    console.log(req.ip);
    res.send("Hello World!");
});

// *** TRADINGVIEW ***

// Data feed configuration data
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#data-feed-configuration-data
app.get("/config", (req, res) => {
    res.send({
        supported_resolutions: ["60"],
        supports_group_request: false,
        supports_marks: false,
        supports_search: true,
        supports_timescale_marks: false,
    });
});

// Symbol resolve
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#symbol-resolve
app.get("/symbols", (req, res) => {
    const symbol = req.query.symbol;
    console.log({ symbol });
    res.send({
        name: symbol,
        full_name: symbol,
        // base_name: [symbol],
        // ticker: symbol,
        description: symbol,
        type: "crypto",
        session: "24x7",
        exchange: "Massa",
        listed_exchange: "Massa",
        timezone: "Etc/UTC",
        format: "price",
        pricescale: 100000000,
        minmov: 1,

        // has_intraday: false,
        // supported_resolutions: ["60"],
    });
});

// Search
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#symbol-search
app.get("/search", (req, res) => {
    const { query, type, exchange, limit } = req.query;
    console.log({ query, type, exchange, limit });

    res.send([]);
});

// Bars
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#bars
app.get("/history", (req, res) => {
    // const { symbol, resolution, from, to, countback } = req.query;
    const symbol = req.query.symbol as string;
    const resolution = req.query.resolution as string;
    const from = parseInt(req.query.from as string);
    const to = parseInt(req.query.to as string);
    const countback = parseInt(req.query.countback as string);
    console.log({ symbol, resolution, from, to, countback });

    // const prices = prisma.price.findMany({
    //     where: {
    //         // address: req.query.symbol,
    //         address: "AS129LnZTYzWwXhBT6tVHbVTQRHPdB4PRdaV8nzRUBLBL647i1KMZ",
    //         date: {
    //             gte: new Date(parseInt(from as string) * 1000),
    //             lte: new Date(parseInt(to as string) * 1000),
    //         },
    //     },
    // });
    // console.log(prices);
    // res.send(prices);

    res.send({
        s: "ok",
        t: Array.from({ length: countback }, (_, i) => from + i * 86400),
        c: Array.from({ length: countback }, (_, i) => Math.random() * 10000),

        // s: "error",
        // errmsg: "unknown_symbol",
    });
});

// Server time
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#server-time
app.get("/time", (req, res) => {
    res.send(Math.floor(Date.now() / 1000));
});

// *** TRADINGVIEW END ***

app.use("/trpc", expressMiddleware);

app.listen(3001);
console.log("Listening on port 3001");

// Start WS client

// const wsClient = new WebSocket("ws://64.226.72.133:33036");

// if (!wsClient) console.log("WS not available");
// else {
//     wsClient.onclose = () => {
//         console.log("ws closed");
//     };

//     wsClient.onerror = (error) => {
//         console.error("ws error", error);
//     };

//     wsClient.onmessage = (message) => {
//         const data = JSON.parse(message.data as string);

//         if ("params" in data) {
//             const res = data.params.result as ISubscribedFullBlocksMessage;
//             console.log(res.header.id, res.operations.length);
//             res.operations.forEach((operation) => {
//                 const txId = operation[0];
//                 const op = (operation[1] as unknown as IFilledBlockInfo).content
//                     .op;
//                 if ("CallSC" in op) {
//                     const method = (op as ICallSmartContractOpType).CallSC
//                         .target_func;
//                     web3Client
//                         .smartContracts()
//                         .awaitRequiredOperationStatus(
//                             txId,
//                             EOperationStatus.FINAL
//                         )
//                         .then((status) => {
//                             if (status !== EOperationStatus.FINAL) {
//                                 console.log(
//                                     txId + " failed to reached final status"
//                                 );
//                                 return;
//                             }

//                             console.log(txId + " has reached final status");

//                             web3Client
//                                 .smartContracts()
//                                 .getFilteredScOutputEvents({
//                                     start: null,
//                                     end: null,
//                                     emitter_address: null,
//                                     original_caller_address: null,
//                                     is_final: null,
//                                     original_operation_id: txId,
//                                 })
//                                 .then((events) =>
//                                     processEvents(txId, method, events)
//                                 );
//                         });
//                 }
//             });
//         }
//     };

//     wsClient.onopen = () => {
//         console.log("ws open");
//         wsClient.send(
//             JSON.stringify({
//                 jsonrpc: "2.0",
//                 id: 1,
//                 method: generateFullRequestName(
//                     WS_RPC_REQUEST_METHOD_BASE.SUBSCRIBE,
//                     WS_RPC_REQUEST_METHOD_NAME.NEW_FILLED_BLOCKS
//                 ),
//                 params: [],
//             })
//         );
//     };

//     console.log("Connected to WS");
// }

// // Start cron tasks

// priceTask.start();
// analyticsTask.start();
// autonomousEvents.start();

// @ts-ignore: Unreachable code error
BigInt.prototype.toJSON = function (): number {
    return Number(this);
};
