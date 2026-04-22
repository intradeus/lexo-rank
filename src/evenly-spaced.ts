/**
 * Shape every rank class satisfies: each instance can produce a new rank
 * strictly between itself and another instance. Lets `evenlySpaced` work
 * uniformly across all four flavours (`LexoRank`, `LexoBucketRank`,
 * `LexoDecimalRank`, `LexoBucketDecimalRank`) without a generic constraint
 * against their concrete classes.
 */
export interface BetweenCapable<T> {
  between(other: T): T;
}

/**
 * Generate `count` ranks roughly evenly spaced between `lo` and `hi` (both
 * exclusive). The returned array is strictly ascending and every rank sits
 * in the open interval `(lo, hi)`.
 *
 * Uses a recursive binary-split: pick the midpoint, then recursively fill
 * the left and right halves. Resulting ranks have logarithmic length growth
 * in `count` — far better than allocating them left-to-right, which would
 * give the pathological always-insert-at-end pattern and linear growth.
 *
 * Primary use case: bulk rebalancing. After migrating rows into a fresh
 * bucket, call `evenlySpaced(bucketMin, bucketMax, rows.length)` to get
 * short, well-distributed ranks to assign back to each row.
 */
export function evenlySpaced<T extends BetweenCapable<T>>(
  lo: T,
  hi: T,
  count: number
): T[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`count must be a non-negative integer (got ${count})`);
  }
  if (count === 0) return [];

  const result = new Array<T>(count);

  function fill(start: number, end: number, bLo: T, bHi: T): void {
    if (start >= end) return;
    // `| 0` is a cheap floor for non-negative ints; the index stays in range
    // because `start < end` and both are non-negative.
    const mid = (start + end) >> 1;
    const value = bLo.between(bHi);
    result[mid] = value;
    fill(start, mid, bLo, value);
    fill(mid + 1, end, value, bHi);
  }

  fill(0, count, lo, hi);
  return result;
}
