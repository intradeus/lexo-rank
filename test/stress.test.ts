import { describe, it, expect } from "vitest";
import { createLexoRank } from "../src/factory";

// A realistic stress test for large-scale random insertion. We simulate an
// ordered list with a singly-linked list backed by parallel arrays so each
// insertion is O(1). A plain array splice would be O(n) per insert and make
// the million-element case quadratic.
//
// We run the same test against every supported configuration so that all
// four rank classes (simple, bucket, decimal, bucket+decimal) are exercised
// under the same load profile and asserted to preserve lexicographic order.

interface RankLike<Self> {
  toString(): string;
  compareTo(other: Self): number;
}

interface RankModule<T> {
  min(): T;
  max(): T;
  between(a: T, b: T): T;
}

function runStress<T extends RankLike<T>>(
  R: RankModule<T>,
  N: number
): { maxStrLen: number; uniqueCount: number } {
  const values = new Array<T>(N + 2);
  const next = new Int32Array(N + 2);

  values[0] = R.min();
  values[1] = R.max();
  next[0] = 1;
  next[1] = -1;

  // Node IDs that have a valid successor (i.e. not the tail). We pick
  // insertion points from here so we always have a `next` to bracket with.
  const nonTail = new Int32Array(N + 1);
  nonTail[0] = 0;
  let nonTailLen = 1;

  let maxStrLen = values[0].toString().length;

  for (let i = 0; i < N; i++) {
    const pick = (Math.random() * nonTailLen) | 0;
    const a = nonTail[pick]!;
    const c = next[a]!;
    const newId = i + 2;
    const v = R.between(values[a]!, values[c]!);
    values[newId] = v;
    next[newId] = c;
    next[a] = newId;
    nonTail[nonTailLen++] = newId;
    const l = v.toString().length;
    if (l > maxStrLen) maxStrLen = l;
  }

  // Walk the linked list once and assert strict ordering. Strict ordering
  // also implies uniqueness, so we don't need a Set (which at 1M strings
  // costs significant memory).
  let curr = 0;
  let count = 0;
  let previous: T | null = null;
  while (curr !== -1) {
    const v = values[curr]!;
    if (previous !== null && previous.compareTo(v) >= 0) {
      throw new Error(
        `ordering violation at position ${count}: '${previous.toString()}' >= '${v.toString()}'`
      );
    }
    previous = v;
    curr = next[curr]!;
    count++;
  }
  if (count !== N + 2) {
    throw new Error(`linked-list walk visited ${count} nodes, expected ${N + 2}`);
  }
  return { maxStrLen, uniqueCount: count };
}

const N = 1_000_000;
const STRESS_TIMEOUT = 120_000;

describe("stress — 1,000,000 random insertions", () => {
  it(
    "simple mode",
    () => {
      const R = createLexoRank();
      const { maxStrLen, uniqueCount } = runStress(R, N);
      expect(uniqueCount).toBe(N + 2);
      // Random insertion keeps rank length roughly logarithmic in N.
      expect(maxStrLen).toBeLessThan(60);
    },
    STRESS_TIMEOUT
  );

  it(
    "bucket mode",
    () => {
      const R = createLexoRank({ bucket: true });
      const { maxStrLen, uniqueCount } = runStress(R, N);
      expect(uniqueCount).toBe(N + 2);
      // Bucket adds a constant "0|" prefix to every rank, so the base bound
      // simply gains 2 characters.
      expect(maxStrLen).toBeLessThan(62);
    },
    STRESS_TIMEOUT
  );

  it(
    "decimal mode",
    () => {
      const R = createLexoRank({ decimal: true });
      const { maxStrLen, uniqueCount } = runStress(R, N);
      expect(uniqueCount).toBe(N + 2);
      // Fixed-width integer (6) plus separator plus variable decimal.
      // log36(1e6) ≈ 3.85 integer "splits" before we might see decimals,
      // but with width=6 there's enormous slack, so decimals rarely grow.
      expect(maxStrLen).toBeLessThan(40);
    },
    STRESS_TIMEOUT
  );

  it(
    "bucket + decimal mode (Jira-style)",
    () => {
      const R = createLexoRank({ bucket: true, decimal: true });
      const { maxStrLen, uniqueCount } = runStress(R, N);
      expect(uniqueCount).toBe(N + 2);
      expect(maxStrLen).toBeLessThan(42);
    },
    STRESS_TIMEOUT
  );

  it(
    "decimal mode with narrow integer width (forces decimal fallback)",
    () => {
      // Width=2 in BASE36 gives only 36² = 1296 integer slots — nowhere near
      // enough for 100k items, so the decimal fallback runs thousands of
      // times. This is the path most users of the full Jira format are
      // implicitly relying on.
      const SMALL_N = 100_000;
      const R = createLexoRank({ decimal: true, integerWidth: 2 });
      const { maxStrLen, uniqueCount } = runStress(R, SMALL_N);
      expect(uniqueCount).toBe(SMALL_N + 2);
      // With only 1296 integer slots, every insert beyond that forces decimal
      // growth, and decimals grow logarithmically: ~ log36(1e5 / 1296) ≈ 3-4.
      expect(maxStrLen).toBeLessThan(40);
    },
    STRESS_TIMEOUT
  );
});
