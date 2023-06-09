import { Args, IEvent, strToBytes } from "@massalabs/massa-web3";
import { web3Client } from "./client";

const REAL_ID_SHIFT = 2 ** 17;

export const getPriceFromId = (id: number, binStep: number): number =>
  (1 + binStep / 10000) ** (id - REAL_ID_SHIFT);

export const getIdFromPrice = (price: number, binStep: number): number =>
  Math.round(Math.log(price) / Math.log(1 + binStep / 10000) + REAL_ID_SHIFT);

export const getBinStep = (pairAddress: string): Promise<number | undefined> =>
  web3Client
    .publicApi()
    .getDatastoreEntries([
      {
        address: pairAddress,
        key: strToBytes("FEES_PARAMETERS"),
      },
    ])
    .then((entries) => {
      if (!entries[0].final_value) return;

      const args = new Args(entries[0].final_value);
      const binStep = args.nextU32();
      return binStep;
    });

export const getCallee = (event: IEvent): string =>
  event.context.call_stack[event.context.call_stack.length - 1];
