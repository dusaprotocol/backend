export enum WS_RPC_REQUEST_METHOD_BASE {
    SUBSCRIBE = "subscribe",
    UNSUBSCRIBE = "unsubscribe",
}

export enum WS_RPC_REQUEST_METHOD_NAME {
    UNKNOWN = "unknown",
    NEW_BLOCKS = "new_blocks",
    NEW_BLOCKS_HEADERS = "new_blocks_headers",
    NEW_FILLED_BLOCKS = "new_filled_blocks",
}

export const generateFullRequestName = (
    methodBase: WS_RPC_REQUEST_METHOD_BASE,
    methodName: WS_RPC_REQUEST_METHOD_NAME
): string => {
    return `${methodBase.toString()}_${methodName.toString()}`;
};
