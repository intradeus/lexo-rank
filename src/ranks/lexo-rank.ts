import { BASE36, type Alphabet } from "../alphabet";
import { assertRankLength, assertString, genBetween } from "../algorithm/between";
import { evenlySpaced } from "../evenly-spaced";
import {
  analyze as analyzeRanks,
  move as moveRank,
  rankAfter as rankAfterHelper,
  rankBefore as rankBeforeHelper,
  rankBetween as rankBetweenHelper,
  safeParse,
  type AnalyzeOptions,
  type RankAnalysis
} from "../helpers";
import { maybeFireRebalanceMonitor, type RebalanceMonitor } from "../rebalance-monitor";

/**
 * A non-bucketed LexoRank. The rank is a single string that sorts
 * lexicographically and supports insertion of new ranks between any two
 * existing ranks without reindexing.
 *
 * For Jira-compatible bucketed ranks (e.g. `0|hzzzzz:`), use `LexoBucketRank`.
 */
export class LexoRank {
  readonly value: string;
  readonly alphabet: Alphabet;
  readonly monitor: RebalanceMonitor<LexoRank> | undefined;

  constructor(
    value: string,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ) {
    assertString(value, "value");
    assertRankLength(value, "value");
    alphabet.validate(value);
    if (value.length === 0) {
      throw new Error("Rank value cannot be empty");
    }
    this.value = value;
    this.alphabet = alphabet;
    this.monitor = monitor;
  }

  /** The smallest safe rank (leaves room below for `genPrev`). */
  static min(
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return new LexoRank(alphabet.charAt(1), alphabet, monitor);
  }

  /** The largest safe rank (leaves room above for `genNext`). */
  static max(
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return new LexoRank(alphabet.charAt(alphabet.size - 2), alphabet, monitor);
  }

  /** A rank roughly in the middle of the alphabet. Good starting point. */
  static middle(
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return new LexoRank(alphabet.charAt(alphabet.size >> 1), alphabet, monitor);
  }

  /** Produce a rank strictly between `a` and `b`. They must share an alphabet. */
  static between(a: LexoRank, b: LexoRank): LexoRank {
    if (a.alphabet !== b.alphabet) {
      throw new Error("Cannot compute between ranks with different alphabets");
    }
    const [lo, hi] = a.value < b.value ? [a, b] : [b, a];
    // The new rank inherits `a`'s monitor; mirrors how it inherits `a.alphabet`.
    const result = new LexoRank(
      genBetween(lo.value, hi.value, a.alphabet),
      a.alphabet,
      a.monitor
    );
    maybeFireRebalanceMonitor(result, a.monitor);
    return result;
  }

  /** Parse a rank from a raw string. */
  static parse(
    value: string,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return new LexoRank(value, alphabet, monitor);
  }

  /**
   * Generate `count` ranks roughly evenly spaced across the safe range
   * (between `min(alphabet)` and `max(alphabet)`). Useful for bulk seeding
   * or rebalancing a collection with fresh short ranks.
   */
  static evenlySpaced(
    count: number,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank[] {
    return evenlySpaced(
      LexoRank.min(alphabet, monitor),
      LexoRank.max(alphabet, monitor),
      count
    );
  }

  toString(): string {
    return this.value;
  }

  compareTo(other: LexoRank): number {
    if (this.value < other.value) return -1;
    if (this.value > other.value) return 1;
    return 0;
  }

  equals(other: LexoRank): boolean {
    // Intentionally ignores `monitor` — two ranks with the same value and
    // alphabet are semantically equal regardless of which handler is wired up.
    return this.value === other.value && this.alphabet === other.alphabet;
  }

  /** Produce a rank strictly greater than this one. */
  genNext(): LexoRank {
    const absMax = this.alphabet.charAt(this.alphabet.size - 1);
    const result = new LexoRank(
      genBetween(this.value, absMax, this.alphabet),
      this.alphabet,
      this.monitor
    );
    maybeFireRebalanceMonitor(result, this.monitor);
    return result;
  }

  /** Produce a rank strictly less than this one. */
  genPrev(): LexoRank {
    const absMin = this.alphabet.charAt(0);
    const result = new LexoRank(
      genBetween(absMin, this.value, this.alphabet),
      this.alphabet,
      this.monitor
    );
    maybeFireRebalanceMonitor(result, this.monitor);
    return result;
  }

  /** Produce a rank strictly between this and `other`. */
  between(other: LexoRank): LexoRank {
    return LexoRank.between(this, other);
  }

  /**
   * Rank for the "insert after `prev`" case — falls back to `middle` when
   * `prev` is omitted (empty-list insert). `alphabet` and `monitor` are only
   * consulted for the fallback; otherwise the derived rank inherits from
   * `prev`.
   */
  static rankAfter(
    prev?: LexoRank,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return rankAfterHelper(prev, () => LexoRank.middle(alphabet, monitor));
  }

  /** Symmetric to `rankAfter`. */
  static rankBefore(
    next?: LexoRank,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return rankBeforeHelper(next, () => LexoRank.middle(alphabet, monitor));
  }

  /**
   * Combined variant — either, both, or neither of `a`/`b` may be absent.
   * One call covers every drag-and-drop boundary.
   */
  static rankBetween(
    a?: LexoRank,
    b?: LexoRank,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return rankBetweenHelper(a, b, () => LexoRank.middle(alphabet, monitor));
  }

  /**
   * Sort comparator: `arr.sort(LexoRank.compare)` works unbound because this
   * doesn't use `this`.
   */
  static compare(this: void, a: LexoRank, b: LexoRank): number {
    return a.compareTo(b);
  }

  /** Non-throwing parse. `true` iff `raw` is a valid rank under `alphabet`. */
  static isValid(raw: unknown, alphabet: Alphabet = BASE36): boolean {
    if (typeof raw !== "string") return false;
    return safeParse(() => new LexoRank(raw, alphabet)) !== undefined;
  }

  /**
   * Compute the new rank for moving `list[from]` to position `to` in the
   * post-move list. Returns the original rank when `from === to`.
   */
  static move(
    list: readonly LexoRank[],
    from: number,
    to: number,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank {
    return moveRank(list, from, to, () => LexoRank.middle(alphabet, monitor));
  }

  /** Length-distribution summary — see `RankAnalysis`. */
  static analyze(ranks: readonly LexoRank[], options?: AnalyzeOptions): RankAnalysis {
    return analyzeRanks(ranks, options);
  }

  /**
   * Non-throwing `parse`. Returns the rank on success, `undefined` on any
   * failure (invalid character, wrong length, non-string input, …).
   */
  static safeParse(
    raw: unknown,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank | undefined {
    if (typeof raw !== "string") return undefined;
    return safeParse(() => new LexoRank(raw, alphabet, monitor));
  }

  /** Non-throwing `rankAfter`. Returns `undefined` when `prev` is at the absolute max. */
  static safeRankAfter(
    prev?: LexoRank,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank | undefined {
    return safeParse(() => LexoRank.rankAfter(prev, alphabet, monitor));
  }

  /** Non-throwing `rankBefore`. Returns `undefined` when `next` is at the absolute min. */
  static safeRankBefore(
    next?: LexoRank,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank | undefined {
    return safeParse(() => LexoRank.rankBefore(next, alphabet, monitor));
  }

  /**
   * Non-throwing `rankBetween`. Returns `undefined` for degenerate inputs
   * (equal bounds, adjacent-in-min-char neighbours, mismatched alphabets).
   */
  static safeRankBetween(
    a?: LexoRank,
    b?: LexoRank,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank | undefined {
    return safeParse(() => LexoRank.rankBetween(a, b, alphabet, monitor));
  }

  /** Non-throwing `move`. Returns `undefined` on out-of-range / empty-list inputs. */
  static safeMove(
    list: readonly LexoRank[],
    from: number,
    to: number,
    alphabet: Alphabet = BASE36,
    monitor?: RebalanceMonitor<LexoRank>
  ): LexoRank | undefined {
    return safeParse(() => LexoRank.move(list, from, to, alphabet, monitor));
  }
}
