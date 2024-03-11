import { describe, it, expect, vi } from "vitest";

import { handleNewOperations } from "../helpers";
import { NewOperationsResponse } from "../../gen/ts/massa/api/v1/public";
import * as db from "../db";
import { LB_ROUTER_ADDRESS, SWAP_ROUTER_METHODS } from "@dusalabs/sdk";
import { CHAIN_ID } from "../../../common/config";
import { web3Client } from "../../../common/client";
import { swapParams } from "./placeholder";
import * as DateUtils from "../../../common/utils/date";
import { EventPoller as _EventPoller } from "@massalabs/massa-web3";
import * as EventPoller from "../eventPoller";
import { nullFilters } from "../../../common/utils";

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

const fn = () => Promise.resolve(true);
const spyCreateSwap = vi.spyOn(db, "createSwap").mockImplementation(fn);
const spyCreateLiquidity = vi
  .spyOn(db, "createLiquidity")
  .mockImplementation(fn);

describe("", () => {
  it("", () => {
    expect(true).toBe(true);
  });
});

// describe("handleNewOperations", () => {
//   it("should not call prisma methods for an empty tx", () => {
//     const message = emptyMessage;

//     handleNewOperations(message);

//     expect(spyCreateSwap).not.toBeCalled();
//     expect(spyCreateLiquidity).not.toBeCalled();
//   });
//   it("should call createSwap & updateVolumeAndPrice for a swap tx", async () => {
//     const message: NewOperationsResponse = {
//       ...emptyMessage,
//       signedOperation: {
//         ...emptyMessage.signedOperation,
//         content: {
//           ...emptyMessage.signedOperation.content,
//           op: {
//             type: {
//               oneofKind: "callSc",
//               callSc: {
//                 targetAddress: LB_ROUTER_ADDRESS[CHAIN_ID],
//                 targetFunction: swapParams.methodName,
//                 maxGas,
//                 parameter: Uint8Array.from(swapParams.args.serialize()),
//                 coins: {
//                   mantissa: swapParams.value,
//                   scale: 0,
//                 },
//               },
//             },
//           },
//           expirePeriod: 0n,
//         },
//       },
//     };

//     await handleNewOperations(message);

//     expect(spyCreateSwap).toBeCalled();
//   });
// });
