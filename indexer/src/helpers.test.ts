import { describe, it, expect, vi } from "vitest";

import { handleNewOperations } from "./helpers";
import { NewOperationsResponse } from "../gen/ts/massa/api/v1/public";
import * as db from "./db";
import { LB_ROUTER_ADDRESS, SWAP_ROUTER_METHODS } from "@dusalabs/sdk";
import { CHAIN_ID, web3Client } from "../../common/client";
import { params } from "./__tests__/placeholder";
import * as DateUtils from "../../common/utils/date";
import { EventPoller as _EventPoller } from "@massalabs/massa-web3";
import * as EventPoller from "./eventPoller";
import { nullFilters } from "../../common/utils";

const emptyMessage: Required<NewOperationsResponse> = {
  signedOperation: {
    contentCreatorAddress: "",
    secureHash: "",
    contentCreatorPubKey: "",
    serializedSize: 0n,
    signature: "",
    content: {
      expirePeriod: 0n,
    },
  },
};
const maxGas = 0n;

const fn = () => Promise.resolve();
const spyCreateSwap = vi.spyOn(db, "createSwap").mockImplementation(fn);
const spyUpdateVolumePrice = vi
  .spyOn(db, "updateVolumeAndPrice")
  .mockImplementation(fn);
const spyCreateLiquidity = vi
  .spyOn(db, "createLiquidity")
  .mockImplementation(fn);

const spyEventPoller = vi
  .spyOn(EventPoller, "pollAsyncEvents")
  // @ts-ignore
  .mockImplementation((opId: string) => {
    return Promise.resolve({
      isError: false,
      eventPoller: new _EventPoller(nullFilters, 1000, web3Client),
      events: [],
    });
  });
const spyGetTimestamp = vi
  .spyOn(DateUtils, "getTimestamp")
  .mockImplementation(() => new Date());

describe("handleNewOperations", () => {
  it("should not call prisma methods for an empty tx", () => {
    const message = emptyMessage;

    handleNewOperations(message);

    expect(spyCreateSwap).not.toBeCalled();
    expect(spyUpdateVolumePrice).not.toBeCalled();
    expect(spyCreateLiquidity).not.toBeCalled();
  });
  it("should call createSwap & updateVolumeAndPrice for a swap tx", async () => {
    const message: NewOperationsResponse = {
      ...emptyMessage,
      signedOperation: {
        ...emptyMessage.signedOperation,
        content: {
          ...emptyMessage.signedOperation.content,
          op: {
            type: {
              oneofKind: "callSc",
              callSc: {
                targetAddress: LB_ROUTER_ADDRESS[CHAIN_ID],
                targetFunction: params.methodName,
                maxGas,
                parameter: Uint8Array.from(params.args.serialize()),
                coins: {
                  mantissa: params.value,
                  scale: 0,
                },
              },
            },
          },
          expirePeriod: 0n,
        },
      },
    };

    await handleNewOperations(message);

    expect(spyCreateSwap).toBeCalled();
    expect(spyUpdateVolumePrice).toBeCalled();
  });
});
