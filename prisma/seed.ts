import { Analytics, Price, Prisma, PrismaClient } from "@prisma/client";
import { getCallee, getPriceFromId } from "../src/methods";
import { addTvl, getActivePrice } from "../src/socket";
import { web3Client } from "../src/client";
import { getGenesisTimestamp, parseSlot } from "../src/utils";

const prisma = new PrismaClient();

interface Pool {
    address: string;
    binStep: number;
    activeId: number;
}

const pools: Pool[] = [
    {
        address: "AS129LnZTYzWwXhBT6tVHbVTQRHPdB4PRdaV8nzRUBLBL647i1KMZ",
        binStep: 10,
        activeId: 123559,
    },
    {
        // USDC-MASSA
        address: "AS12Gnt1pVQJ4ip4DRRLmdusGj3wVjkA9NVpCKP1qs8CyzCgbWwHF",
        binStep: 20,
        activeId: 130266,
    },
    {
        // MASSA-WETH
        address: "AS128hN9i7DRCcFTmY4LVErFoHR2omShNiQPu662JoEAbWx4CEMF1",
        binStep: 15,
        activeId: 127136,
    },
];
const betaLaunch = new Date(1684332000 * 1000).getTime();
const precision = 10 ** 9;

async function generateAnalytics(pool: Pool) {
    const data: Analytics[] = [];

    let prevValue = 5000;
    for (let i = 0; i < 720; i++) {
        const value = 0;
        const binId = Math.round(2 ** 17 - 50 + Math.random() * 50);
        const date = new Date(Date.now() - 1000 * 60 * 60 * i);
        date.setHours(date.getHours(), 0, 0, 0);

        data.push({
            address: pool.address,
            date,
            token0Locked: BigInt(value),
            token1Locked: BigInt(value),
            volume: BigInt(value),
            fees: BigInt(Math.round(value / 1000)),
        });

        prevValue = value;
    }

    prisma.analytics
        .createMany({
            data,
        })
        .catch((err) => console.log(err));
}

async function generatePrices(pool: Pool) {
    const data: Price[] = [];

    let close = await getActivePrice(pool.address);
    for (let j = 0; j < 720; j++) {
        const open = close;
        const high = close;
        const low = close;

        const date = new Date(betaLaunch - 1000 * 60 * 60 * j);
        date.setHours(date.getHours(), 0, 0, 0);

        data.push({
            address: pool.address,
            date,
            open,
            close,
            high,
            low,
        });
        close = open;
    }

    await prisma.price
        .createMany({
            data,
        })
        .catch((err) => console.log(err));
}

async function trackPastTVL() {
    const genesisTimestamp = getGenesisTimestamp();

    const events = await web3Client.smartContracts().getFilteredScOutputEvents({
        start: null,
        end: null,
        emitter_address: null, //pool.address
        original_caller_address: null,
        original_operation_id: null,
        is_final: null,
    });
    // const filtered = events.filter((e) => getCallee(e) === pool.address);
    const filtered = events.filter(
        (e) =>
            e.data.startsWith("DEPOSITED_TO_BIN:") ||
            e.data.startsWith("REMOVED_FROM_BIN:")
    );
    filtered.forEach((e) => {
        if (
            e.data.startsWith("DEPOSITED_TO_BIN:") ||
            e.data.startsWith("REMOVED_FROM_BIN:")
        ) {
            const isAdd = e.data.startsWith("DEPOSITED_TO_BIN:");
            const [_to, _binId, amountX, amountY] = e.data.split(",");
            const date = parseSlot(e.context.slot, genesisTimestamp);

            addTvl(
                getCallee(e), //pool.address
                isAdd ? Number(amountX) : Number(-amountX),
                isAdd ? Number(amountY) : Number(-amountY),
                new Date(date)
            );
        }
    });
}

async function main() {
    // for (const pool of pools) {
    //     generateAnalytics(pool);
    //     generatePrices(pool);
    // }

    trackPastTVL();
}

main();
