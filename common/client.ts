import { Client, IProvider, ProviderType } from "@massalabs/massa-web3";
import { CHAIN_URL } from "./config";

const providers: IProvider[] = [
  {
    url: CHAIN_URL,
    type: ProviderType.PUBLIC,
  },
  {
    url: CHAIN_URL,
    type: ProviderType.PRIVATE,
  },
];

export const web3Client: Client = new Client({
  retryStrategyOn: false,
  providers,
});
