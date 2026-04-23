/**
 * Shared ergonomic helpers that work uniformly across every rank class. Each
 * class exposes thin static wrappers that bind in its own config (alphabet,
 * bucket list, etc.) so callers rarely touch these directly — but they're
 * exported for consumers who want to build their own helpers on top.
 */

/** Shape the helpers rely on: each rank can step to a neighbour and bisect. */
export interface DragCapable<T> {
  genNext(): T;
  genPrev(): T;
  between(other: T): T;
}

/** Shape required by `analyze` — just a `toString()` that renders the rank. */
export interface Renderable {
  toString(): string;
}

/**
 * Produce a rank after `prev`, or a freshly-seeded one when `prev` is absent
 * (the "insert into an empty list" case). The `fallback` is typically
 * `() => Class.middle(config)`.
 */
export function rankAfter<T extends DragCapable<T>>(
  prev: T | undefined,
  fallback: () => T
): T {
  return prev ? prev.genNext() : fallback();
}

/**
 * Produce a rank before `next`, or a freshly-seeded one when `next` is absent.
 * Symmetric with `rankAfter`.
 */
export function rankBefore<T extends DragCapable<T>>(
  next: T | undefined,
  fallback: () => T
): T {
  return next ? next.genPrev() : fallback();
}

/**
 * The three-way variant: `a` and `b` both optional. Covers every drag-and-drop
 * boundary (head, tail, between two items, empty list) with one call.
 */
export function rankBetween<T extends DragCapable<T>>(
  a: T | undefined,
  b: T | undefined,
  fallback: () => T
): T {
  if (a && b) return a.between(b);
  if (a) return a.genNext();
  if (b) return b.genPrev();
  return fallback();
}

/**
 * Compute the new rank for an item being moved from `from` to `to` within a
 * sorted list. `to` is the target position in the post-move list (the
 * drag-and-drop convention — "drop here").
 *
 * This helper is the #1 reason teams reach for lexorank: the bracket-picking
 * logic is easy to get subtly wrong. When `from === to` the original rank
 * is returned unchanged, so callers can assign the result back
 * unconditionally without a no-op check.
 *
 * `fallback` is the "empty bracket" recipient — it's never invoked when both
 * neighbours exist, and exists only so the generic helper doesn't need to
 * know how to seed a fresh rank.
 */
export function move<T extends DragCapable<T>>(
  list: readonly T[],
  from: number,
  to: number,
  fallback: () => T
): T {
  if (list.length === 0) {
    throw new Error("move requires a non-empty list");
  }
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new Error(`move indices must be integers (got from=${from}, to=${to})`);
  }
  if (from < 0 || from >= list.length) {
    throw new RangeError(`from index ${from} out of range [0, ${list.length - 1}]`);
  }
  if (to < 0 || to >= list.length) {
    throw new RangeError(`to index ${to} out of range [0, ${list.length - 1}]`);
  }
  if (from === to) return list[from]!;

  // Compute neighbours without materialising a copy of the list. The "reduced
  // list" (list without list[from]) maps to the original like so:
  //   reduced[i] === list[i]       when i < from
  //   reduced[i] === list[i + 1]   when i >= from
  let prev: T | undefined;
  let next: T | undefined;
  if (from < to) {
    // Inserting after the removal shifts `to` past the removed slot, so:
    //   reduced[to - 1] === list[to]        (to-1 >= from)
    //   reduced[to]     === list[to + 1]    (may be past the end)
    prev = list[to];
    next = to + 1 < list.length ? list[to + 1] : undefined;
  } else {
    // from > to — inserting before the removal doesn't shift:
    //   reduced[to - 1] === list[to - 1]    (to - 1 < from)
    //   reduced[to]     === list[to]        (to < from)
    prev = to > 0 ? list[to - 1] : undefined;
    next = list[to];
  }
  return rankBetween(prev, next, fallback);
}

/** Result of `analyze` — compact density report for a sorted rank list. */
export interface RankAnalysis {
  /** Number of ranks considered. */
  count: number;
  /** Longest rendered rank length (0 on empty input). */
  max: number;
  /** Mean rendered rank length (0 on empty input). */
  avg: number;
  /** 95th-percentile rendered rank length (0 on empty input). */
  p95: number;
  /**
   * Heuristic trigger: `true` when `max` or `avg` exceed their thresholds.
   * Thresholds default to 30 / 15 (the starting points the README
   * recommends) but can be overridden per call via `AnalyzeOptions`, or
   * indirectly via `RebalanceMonitor.rebalanceThreshold` /
   * `rebalanceAvgThreshold` when calling through the factory module.
   * Ignore this field and read `max`/`avg`/`p95` directly if you want a
   * different policy.
   */
  recommendRebalance: boolean;
}

/**
 * Starting-point thresholds for `analyze`'s `recommendRebalance` heuristic.
 * These match the guidance in the README ("rebalance when the longest rank
 * passes ~30, or when the average exceeds ~15"). Override per-call, or via
 * `RebalanceMonitor.rebalanceThreshold` / `rebalanceAvgThreshold`.
 */
export const DEFAULT_REBALANCE_MAX_THRESHOLD = 30;
export const DEFAULT_REBALANCE_AVG_THRESHOLD = 15;

/** Per-call overrides for `analyze`'s `recommendRebalance` logic. */
export interface AnalyzeOptions {
  /** Trip `recommendRebalance` when `max` exceeds this. */
  maxThreshold?: number;
  /** Trip `recommendRebalance` when `avg` exceeds this. */
  avgThreshold?: number;
}

/**
 * Summarise the length distribution of a list of ranks. Length is the
 * rendered string length (what ends up in your database column), so
 * bucket prefixes and decimal suffixes count. Feed any iterable of objects
 * with a `toString()` — the function is generic across all four rank classes.
 *
 * `recommendRebalance` is a convenience heuristic — tune with `options`
 * or bypass it entirely by reading `max`/`avg`/`p95` directly.
 */
export function analyze(
  ranks: readonly Renderable[],
  options: AnalyzeOptions = {}
): RankAnalysis {
  const maxThreshold = options.maxThreshold ?? DEFAULT_REBALANCE_MAX_THRESHOLD;
  const avgThreshold = options.avgThreshold ?? DEFAULT_REBALANCE_AVG_THRESHOLD;
  const count = ranks.length;
  if (count === 0) {
    return { count: 0, max: 0, avg: 0, p95: 0, recommendRebalance: false };
  }
  let max = 0;
  let sum = 0;
  const lengths = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const l = ranks[i]!.toString().length;
    lengths[i] = l;
    if (l > max) max = l;
    sum += l;
  }
  const avg = sum / count;
  // Sort a copy so we don't disturb caller-visible order (though `lengths`
  // is our own array; sorting it in place is fine).
  lengths.sort((a, b) => a - b);
  // Nearest-rank 95th percentile: index = ceil(p * n) - 1, clamped.
  const p95Index = Math.min(count - 1, Math.max(0, Math.ceil(0.95 * count) - 1));
  const p95 = lengths[p95Index]!;
  const recommendRebalance = max > maxThreshold || avg > avgThreshold;
  return { count, max, avg, p95, recommendRebalance };
}

/**
 * Wrap any throw-on-failure parser in a boolean check. Existing `parse`
 * implementations do every validation pass we'd want (alphabet, separators,
 * widths) and throw on the first violation; `safeParse` turns that into a
 * "would this string round-trip?" predicate without forcing callers to
 * try/catch every form value.
 */
export function safeParse<T>(parse: () => T): T | undefined {
  try {
    return parse();
  } catch {
    return undefined;
  }
}

/**
 * A rebalance migration plan: source + target bucket, direction flag, and
 * a ready-to-use rank generator for the target bucket. See
 * `LexoBucketRank.planRebalance` for the entry point.
 */
export interface RebalancePlan<T> {
  /** The bucket the plan starts from. */
  currentBucket: string;
  /** The bucket the plan migrates to (the next in the ring). */
  targetBucket: string;
  /**
   * `true` when `targetBucket` sorts **below** `currentBucket` — the wrap
   * case (e.g. `2 → 0`). Forward migrations write highest-ranked rows first;
   * wrap migrations write lowest-ranked rows first. Getting this direction
   * wrong mid-flight makes readers see a reshuffled list until the migration
   * completes.
   */
  isWrap: boolean;
  /** Generate `count` fresh evenly-spaced ranks in `targetBucket`. */
  ranks(count: number): T[];
}

/**
 * Resolve the next bucket in a ring, with the canonical wrap detection.
 * Returns both the target and a direction flag — the direction is what
 * migrations get wrong most often (`2 → 0` is a wrap and must migrate
 * lowest-ranked rows first; forward moves must migrate highest first).
 */
export function nextBucketInRing(
  buckets: readonly string[],
  current: string
): { target: string; isWrap: boolean } {
  const i = buckets.indexOf(current);
  if (i < 0) {
    throw new Error(`Bucket '${current}' is not one of [${buckets.join(", ")}]`);
  }
  const target = buckets[(i + 1) % buckets.length]!;
  const isWrap = target < current;
  return { target, isWrap };
}
