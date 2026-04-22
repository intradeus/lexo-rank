import type { Alphabet } from "../alphabet";

/**
 * Generate a rank strictly between `prev` and `next` over the given alphabet,
 * constrained to a fixed width. Inputs are right-padded with the alphabet's
 * minimum character to reach `width`. If no midpoint exists at that width
 * (adjacent integers), throws `NoFixedWidthMidpointError` — callers typically
 * catch this and fall back to a decimal fallback.
 *
 * Unlike `genBetween`, this function never extends precision: the returned
 * string always has exactly `width` characters.
 */
export class NoFixedWidthMidpointError extends Error {
  constructor(prev: string, next: string, width: number) {
    super(
      `No rank exists at width ${width} between '${prev}' and '${next}' ` +
        `(they are adjacent in the fixed-width integer space)`
    );
    this.name = "NoFixedWidthMidpointError";
  }
}

export function genBetweenFixedWidth(
  prev: string,
  next: string,
  alphabet: Alphabet,
  width: number
): string {
  if (width < 1) throw new Error("width must be at least 1");
  if (prev.length > width || next.length > width) {
    throw new Error(
      `Inputs exceed fixed width ${width}: '${prev}' (${prev.length}), '${next}' (${next.length})`
    );
  }
  const minChar = alphabet.charAt(0);
  const paddedPrev = prev.padEnd(width, minChar);
  const paddedNext = next.padEnd(width, minChar);
  if (paddedPrev >= paddedNext) {
    throw new Error(
      `prev ('${prev}') must be strictly less than next ('${next}') after padding`
    );
  }
  alphabet.validate(prev);
  alphabet.validate(next);

  const N = alphabet.size;
  const idx = (c: string): number => alphabet.indexOf(c);

  const a = new Array<number>(width);
  const b = new Array<number>(width);
  for (let i = 0; i < width; i++) {
    a[i] = idx(paddedPrev[i]!);
    b[i] = idx(paddedNext[i]!);
  }

  const sum = new Array<number>(width).fill(0);
  let carry = 0;
  for (let i = width - 1; i >= 0; i--) {
    const v = a[i]! + b[i]! + carry;
    sum[i] = v % N;
    carry = v >= N ? 1 : 0;
  }

  const mid = new Array<number>(width).fill(0);
  let rem = carry;
  for (let i = 0; i < width; i++) {
    const v = rem * N + sum[i]!;
    mid[i] = Math.floor(v / 2);
    rem = v % 2;
  }

  const midStr = mid.map((c) => alphabet.charAt(c)).join("");
  if (midStr > paddedPrev && midStr < paddedNext) return midStr;
  throw new NoFixedWidthMidpointError(prev, next, width);
}
