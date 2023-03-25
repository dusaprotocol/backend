import * as dotenv from "dotenv";
import { ClientFactory, IProvider, ProviderType, WalletClient } from "@massalabs/massa-web3";

dotenv.config();

const providers: IProvider[] = [
    {
        url: "http://64.226.72.133:33035",
        type: ProviderType.PUBLIC,
    },
    {
        url: "http://64.226.72.133:33034",
        type: ProviderType.PRIVATE,
    },
    {
        url: "ws://64.226.72.133:33036",
        type: ProviderType.WS,
    },
];

if (!process.env.WALLET_PRIVATE_KEY) {
    throw new Error('WALLET_PRIVATE_KEY is not set. Did you create environment file ".env" ?');
}

const baseAccount = await WalletClient.getAccountFromSecretKey(process.env.WALLET_PRIVATE_KEY);

export const web3Client = await ClientFactory.createCustomClient(providers, true, baseAccount);
