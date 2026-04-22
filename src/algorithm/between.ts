import type { Alphabet } from "../alphabet";

const MAX_EXTENSION = 256;

/**
 * Sanity cap on input rank length. Ranks in practice stay well under 100
 * characters — anything larger is almost certainly corrupted data or an
 * abuse-of-API bug. Rejecting early is cheaper than thrashing on arrays of
 * that size.
 */
export const MAX_RANK_LENGTH = 1024;

/** Assert a value is a non-null string. Clearer than a downstream crash. */
export function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string (got ${typeof value})`);
  }
}

/** Assert a rank string fits within MAX_RANK_LENGTH. */
export function assertRankLength(value: string, name: string): void {
  if (value.length > MAX_RANK_LENGTH) {
    throw new Error(
      `${name} length ${value.length} exceeds maximum of ${MAX_RANK_LENGTH}`
    );
  }
}

/**
 * Generate a rank that is strictly lexicographically between `prev` and `next`
 * over the given alphabet. Both bounds are exclusive.
 *
 * Throws if no such rank exists (e.g. `next === prev + '0...0'` where '0' is
 * the alphabet's minimum character).
 */
export function genBetween(prev: string, next: string, alphabet: Alphabet): string {
  assertString(prev, "prev");
  assertString(next, "next");
  assertRankLength(prev, "prev");
  assertRankLength(next, "next");
  if (prev >= next) {
    throw new Error(
      `prev ('${prev}') must be lexicographically less than next ('${next}')`
    );
  }
  alphabet.validate(prev);
  alphabet.validate(next);

  const N = alphabet.size;
  const idx = (c: string): number => alphabet.indexOf(c);
  const chr = (i: number): string => alphabet.charAt(i);

  // Detect degenerate case: next === prev + (zero chars). In lexicographic
  // order there is no string strictly between 'a' and 'a0' when '0' is the
  // minimum alphabet character, since any string > 'a' that is < 'a0' would
  // need to start with 'a' followed by a character strictly less than '0'.
  if (next.startsWith(prev)) {
    const tail = next.slice(prev.length);
    let allMin = tail.length > 0;
    for (const c of tail) {
      if (idx(c) !== 0) {
        allMin = false;
        break;
      }
    }
    if (allMin) {
      throw new Error(
        `No rank exists strictly between '${prev}' and '${next}' in this alphabet`
      );
    }
  }

  // Interpret both bounds as fractional base-N numbers. We pad to a common
  // length with the minimum digit (0), add them, then divide by 2. If the
  // midpoint collapses back onto `prev` after trimming trailing zero digits,
  // we extend the precision and try again.
  let len = Math.max(prev.length, next.length);
  const minChar = alphabet.charAt(0);

  for (let attempt = 0; attempt < MAX_EXTENSION; attempt++) {
    const a = new Array<number>(len);
    const b = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      a[i] = i < prev.length ? idx(prev[i]!) : 0;
      b[i] = i < next.length ? idx(next[i]!) : 0;
    }

    // Add a + b (fraction addition; any overflow becomes the integer carry).
    const sum = new Array<number>(len).fill(0);
    let carry = 0;
    for (let i = len - 1; i >= 0; i--) {
      const v = a[i]! + b[i]! + carry;
      sum[i] = v % N;
      carry = v >= N ? 1 : 0;
    }

    // Divide by 2, propagating the remainder down (base-N long division).
    const mid = new Array<number>(len).fill(0);
    let rem = carry;
    for (let i = 0; i < len; i++) {
      const v = rem * N + sum[i]!;
      mid[i] = Math.floor(v / 2);
      rem = v % 2;
    }

    let midStr = mid.map(chr).join("");

    // Strip trailing minimum-index characters to keep ranks short. We still
    // verify the trimmed result is strictly greater than prev.
    while (midStr.length > 1 && midStr.endsWith(minChar)) {
      midStr = midStr.slice(0, -1);
    }

    // Reject results composed entirely of the minimum character. Such a
    // result is lexicographically valid but cannot be split from an empty
    // predecessor later — e.g. genBetween('', '1') computes '0' at width 1,
    // which blocks any future insert between '' and '0'. Extending precision
    // always escapes this because the next iteration appends a non-min digit.
    const isAllMin = midStr.length > 0 && !midStr.split("").some((c) => c !== minChar);

    if (!isAllMin && midStr > prev && midStr < next) return midStr;

    len++;
  }

  throw new Error(
    `Failed to generate a rank between '${prev}' and '${next}' after ${MAX_EXTENSION} attempts`
  );
}
