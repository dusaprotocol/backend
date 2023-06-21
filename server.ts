import express from "express";
// import { web3Client } from "./src/client";
import cors from "cors";
import { expressMiddleware } from "./src/trpc";
import { prisma } from "./src/db";
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

interface BarsData {
    t: number[];
    o: number[];
    c: number[];
    h: number[];
    l: number[];
}
interface BarsResponse extends BarsData {
    s: "ok" | "no_data" | "error";
}

const supported_resolutions = ["60", "120", "240"];

// Data feed configuration data
// https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/#data-feed-configuration-data
app.get("/config", (req, res) => {
    res.send({
        supported_resolutions,
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
        exchange: "Dusa",
        listed_exchange: "Dusa",
        timezone: "Etc/UTC",
        format: "price",
        pricescale: 10 ** 9,
        minmov: 1,
        has_empty_bars: true,
        has_intraday: true,
        intraday_multipliers: ["60"],
        supported_resolutions,
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
app.get("/history", async (req, res) => {
    // const { symbol, resolution, from, to, countback } = req.query;
    const symbol = req.query.symbol as string;
    const resolution = req.query.resolution as string;
    const from = parseInt(req.query.from as string);
    const to = parseInt(req.query.to as string);
    const countback = parseInt(req.query.countback as string);
    const interval = (to - from) / countback;
    console.log({ symbol, resolution, from, to, countback, interval });

    const prices = await prisma.price.findMany({
        where: {
            address: symbol,
            date: {
                gte: new Date(from * 1000),
                lte: new Date(to * 1000),
            },
        },
        orderBy: {
            date: "desc",
        },
        take: countback,
    });
    const len = prices.length;
    if (len === 0) {
        res.send({
            s: "no_data",
        });
        return;
    }

    const newPrices: BarsData = {
        t: Array.from({ length: len }, () => 0),
        o: Array.from({ length: len }, () => 0),
        c: Array.from({ length: len }, () => 0),
        h: Array.from({ length: len }, () => 0),
        l: Array.from({ length: len }, () => 0),
    };
    for (let i = prices.length - 1; i >= 0; i--) {
        const price = prices[i];
        const index = len - (i + 1); //countback - (len - i);
        newPrices.t[index] = price.date.getTime() / 1000;
        newPrices.o[index] = price.open;
        newPrices.c[index] = price.close;
        newPrices.h[index] = price.high;
        newPrices.l[index] = price.low;
    }

    res.send({
        ...newPrices,
        s: "ok",
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
