export * from "./date";
export * from "./events";

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
