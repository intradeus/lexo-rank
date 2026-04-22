import type { Alphabet } from "../alphabet";
import { genBetween } from "./between";
import { genBetweenFixedWidth, NoFixedWidthMidpointError } from "./fixed-width-between";

export interface DecimalParts {
  readonly integer: string;
  readonly decimal: string;
}

/**
 * Structural midpoint for decimal ranks. Inputs are ordered such that
 * `(loInt, loDec)` precedes `(hiInt, hiDec)` as a tuple (empty decimal sorts
 * before any non-empty decimal, then lexicographic).
 *
 * The algorithm prefers an integer midpoint (empty decimal) when one exists
 * at the configured fixed width. When the integer space is exhausted between
 * the two neighbours (integers adjacent at the fixed width), we fall back
 * to decimal-level placement so the rank still fits.
 */
export function decimalBetween(
  loInt: string,
  loDec: string,
  hiInt: string,
  hiDec: string,
  alphabet: Alphabet,
  integerWidth: number
): DecimalParts {
  if (loInt === hiInt) {
    if (loDec === hiDec) {
      throw new Error("Cannot generate a rank between equal ranks");
    }
    return { integer: loInt, decimal: genBetween(loDec, hiDec, alphabet) };
  }

  try {
    const midInt = genBetweenFixedWidth(loInt, hiInt, alphabet, integerWidth);
    return { integer: midInt, decimal: "" };
  } catch (err) {
    if (!(err instanceof NoFixedWidthMidpointError)) throw err;
    // Integers are adjacent at the fixed width. Two ways to fit:
    //   A) keep loInt and extend loDec
    //   B) keep hiInt with an empty decimal (only valid if hiDec is non-empty)
    // Option B gives the shorter rank string so we prefer it.
    if (hiDec !== "") {
      return { integer: hiInt, decimal: "" };
    }
    return { integer: loInt, decimal: extendDecimal(loDec, alphabet) };
  }
}

/** Append a mid-alphabet character so the result is strictly greater than `dec`. */
function extendDecimal(dec: string, alphabet: Alphabet): string {
  return dec + alphabet.charAt(alphabet.size >> 1);
}

/** True if `(aInt, aDec)` precedes `(bInt, bDec)` as a tuple. */
export function decimalLess(
  aInt: string,
  aDec: string,
  bInt: string,
  bDec: string
): boolean {
  if (aInt !== bInt) return aInt < bInt;
  return aDec < bDec;
}
