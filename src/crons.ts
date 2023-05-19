import cron from "node-cron";
import { prisma } from "./db";

const getPairAddresses = (): Promise<{ address: string }[]> =>
    prisma.price.findMany({
        select: {
            address: true,
        },
        distinct: ["address"],
    });

const fillPrice = () => {
    console.log("running the price task");

    getPairAddresses().then((addresses) => {
        addresses.forEach((address) => {
            prisma.price
                .findFirst({
                    where: {
                        address: address.address,
                    },
                    orderBy: {
                        date: "desc",
                    },
                })
                .then((price) => {
                    if (!price) {
                        return;
                    }

                    const date = new Date();
                    date.setUTCHours(date.getHours(), 0, 0, 0);

                    prisma.price
                        .create({
                            data: {
                                address: address.address,
                                date,
                                close: price.close,
                                high: price.close,
                                low: price.close,
                                open: price.close,
                            },
                        })
                        .then((p) => console.log(p))
                        .catch((e) => console.log(e));
                });
        });
    });
};

const fillAnalytics = () => {
    console.log("running the volume & TVL task");

    getPairAddresses().then((entries) => {
        const date = new Date();
        date.setUTCHours(date.getUTCHours(), 0, 0, 0);

        entries.forEach((entry) => {
            prisma.analytics
                .findFirst({
                    where: {
                        address: entry.address,
                    },
                    orderBy: {
                        date: "desc",
                    },
                })
                .then((analytic) => {
                    if (!analytic) return;

                    prisma.analytics
                        .create({
                            data: {
                                address: entry.address,
                                date,
                                tvl: analytic.tvl,
                                volume: 0,
                                fees: 0,
                            },
                        })
                        .then((t) => console.log(t))
                        .catch((e) => console.log(e));
                });
        });
    });
};

const everyHour = "0 0 */1 * * *" as const;

export const priceTask = cron.schedule(everyHour, () => fillPrice(), {
    scheduled: false,
});
export const analyticsTask = cron.schedule(everyHour, () => fillAnalytics(), {
    scheduled: false,
});
