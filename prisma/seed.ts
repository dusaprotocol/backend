import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const co = await prisma.collection.create({
        data: {
            address: `0x1`,
            name: `Collection 1`,
            symbol: `COL1`,
            standard: `ERC721`,
            description: "This is a collection",
            verified: false,
            supply: 100,
        },
    });
    for (let i = 0; i < 100; i++) {
        await prisma.nFT.create({
            data: {
                collectionAddress: co.address,
                nonce: i + 1,
                name: `NFT ${i + 1}`,
                jsonURI: "",
                imageURI: "",
            },
        });
    }
}

main();
