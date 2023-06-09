import * as dotenv from "dotenv";
import {
    ClientFactory,
    IProvider,
    ProviderType,
    WalletClient,
} from "@massalabs/massa-web3";

dotenv.config();

const buildnet: IProvider[] = [
    {
        url: "https://buildnet.massa.net/api/v2",
        type: ProviderType.PUBLIC,
    },
    {
        url: "https://buildnet.massa.net/api/v2",
        type: ProviderType.PRIVATE,
    },
];

if (!process.env.WALLET_PRIVATE_KEY) {
    throw new Error(
        'WALLET_PRIVATE_KEY is not set. Did you create environment file ".env" ?'
    );
}

const baseAccount = await WalletClient.getAccountFromSecretKey(
    process.env.WALLET_PRIVATE_KEY
);

export const web3Client = await ClientFactory.createCustomClient(
    buildnet,
    true,
    baseAccount
);
