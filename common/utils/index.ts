import { Fraction, TokenAmount } from "@dusalabs/sdk";

export * from "./date";
export * from "./events";

// TODO: move this to SDK
export const numberToFraction = (num: number): Fraction => {
  const precision = 1e18;
  const numerator = BigInt(Math.round(num * precision));
  const denominator = BigInt(precision);
  return new Fraction(numerator, denominator);
};

export const multiplyWithFloat = (
  tokenAmount: TokenAmount,
  value: number
): number => {
  return Number(tokenAmount.multiply(numberToFraction(value)).toSignificant(6));
};
