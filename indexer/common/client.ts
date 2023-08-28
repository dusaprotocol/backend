import * as dotenv from "dotenv";
import {
  Client,
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

export const web3Client: Client = new Client({
  retryStrategyOn: false,
  providers: buildnet,
  periodOffset: 0,
});
