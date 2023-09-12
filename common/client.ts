import * as dotenv from "dotenv";
import {
  Client,
  DefaultProviderUrls,
  IProvider,
  ProviderType,
} from "@massalabs/massa-web3";
import { ChainId } from "@dusalabs/sdk";

dotenv.config();

const url = DefaultProviderUrls.BUILDNET;
const providers: IProvider[] = [
  {
    url,
    type: ProviderType.PUBLIC,
  },
  {
    url,
    type: ProviderType.PRIVATE,
  },
];

export const CHAIN_ID = ChainId.BUILDNET;

export const web3Client: Client = new Client({
  retryStrategyOn: false,
  providers,
});
