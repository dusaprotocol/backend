import cron from "node-cron";

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

                    prisma.price
                        .create({
                            data: {
                                address: address.address,
                                date: new Date(),
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

const fillVolumeAndTVL = () => {
    console.log("running the volume & TVL task");

    getPairAddresses().then((entries) => {
        entries.forEach((entry) => {
            prisma.tVL
                .findFirst({
                    where: {
                        address: entry.address,
                    },
                    orderBy: {
                        date: "desc",
                    },
                })
                .then((tvl) => {
                    if (tvl === null) {
                        return;
                    }

                    prisma.tVL
                        .create({
                            data: {
                                address: entry.address,
                                date: new Date(),
                                tvl: tvl.tvl,
                            },
                        })
                        .then((t) => console.log(t))
                        .catch((e) => console.log(e));
                });

            prisma.volume
                .findFirst({
                    where: {
                        address: entry.address,
                    },
                    orderBy: {
                        date: "desc",
                    },
                })
                .then((volume) => {
                    if (volume === null) {
                        return;
                    }

                    prisma.volume
                        .create({
                            data: {
                                address: entry.address,
                                date: new Date(),
                                volume: volume.volume,
                            },
                        })
                        .then((v) => console.log(v))
                        .catch((e) => console.log(e));
                });
        });
    });
};

export const priceTask = cron.schedule("0 0 */1 * * *", () => fillPrice(), {
    scheduled: false,
});
export const volumeAndTVLTask = cron.schedule(
    "0 0 0 * * *",
    () => fillVolumeAndTVL(),
    {
        scheduled: false,
    }
);
