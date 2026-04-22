import { BASE36, type Alphabet } from "../alphabet";
import { assertRankLength, assertString, genBetween } from "../algorithm/between";
import { evenlySpaced } from "../evenly-spaced";
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
}
