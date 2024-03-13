type GetOperationsResponse = {
  operationsNodes: [];
  operationsCreated: [];
  operationsReceived: Operation[];
};

type Operation = {
  hash: string;
  block_time: string;
  status: string;
  type: string;
  from: string;
  to: string;
  value: string;
  transaction_fee: string;
  op_exec_status: boolean;
};

type OperationWithDetails = {
  id: string;
  in_blocks: string[];
  thread: number;
  in_pool: boolean;
  is_operation_final: boolean;
  op_exec_status: boolean;
  timestamp: string;
  operation: {
    content_creator_address: string;
    content_creator_pub_key: string;
    signature: string;
    id: string;
    content: {
      expire_period: number;
      fee: string;
      op: {
        Transaction: null;
        RollBuy: null;
        RollSell: null;
        ExecuteSC: null;
        CallSC: {
          target_addr: string;
          coins: string;
          param: string;
          max_gas: string;
          target_func: string;
        };
      };
    };
  };
};

const getOperations = async () => {
  const api = "https://explorer-api.massa.net";
  const endpoint = "address";
  const scAddress = "AS12qzyNBDnwqq2vYwvUMHzrtMkVp6nQGJJ3TETVKF5HCd4yymzJP";
  const path = "operations";
  const url = `${api}/${endpoint}/${scAddress}/${path}`;
  return fetch(url).then((res) => res.json());
};

const getOperation = async () => {
  const api = "https://explorer-api.massa.net";
  const endpoint = "operation";
  const operationId = "O123TTr7YhFLaeQNTC7hMUi4Q9nEBcrrcJG2Es3B5RcG87tm1h4B";
  const url = `${api}/${endpoint}/${operationId}`;
  return fetch(url).then((res) => res.json());
};

(async () => {
  const op: OperationWithDetails = await getOperation();
  const { param } = op.operation.content.op.CallSC;
  console.log(Buffer.from(param, "base64"));
})();
