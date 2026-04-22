import { BASE36, type Alphabet } from "../alphabet";
import { assertRankLength, assertString, genBetween } from "../algorithm/between";
import { evenlySpaced } from "../evenly-spaced";
import { maybeFireRebalanceMonitor, type RebalanceMonitor } from "../rebalance-monitor";

export const DEFAULT_BUCKETS = Object.freeze(["0", "1", "2"] as const);
export const DEFAULT_BUCKET_SEPARATOR = "|";

export interface LexoBucketRankConfig extends RebalanceMonitor<LexoBucketRank> {
  readonly alphabet?: Alphabet;
  readonly buckets?: readonly string[];
  readonly bucketSeparator?: string;
  /**
   * Which bucket `min`/`max`/`middle`/`evenlySpaced` should target. Must be one
   * of `buckets`. Defaults to `buckets[0]`. Set this when your live data has
   * already been rotated away from the first bucket — e.g. you've migrated
   * once, so your active bucket is now `"1"` instead of `"0"`.
   */
  readonly activeBucket?: string;
}

/**
 * A bucketed LexoRank, Jira-style (`bucket|value`). Buckets exist so that
 * a dense rank space can be rebalanced by moving every row into a fresh
 * bucket (see `inBucket` / `evenlySpacedInBucket`) rather than rewriting
 * each individual rank.
 */
export class LexoBucketRank {
  readonly bucket: string;
  readonly value: string;
  readonly alphabet: Alphabet;
  readonly buckets: readonly string[];
  readonly bucketSeparator: string;
  readonly rebalanceThreshold: number | undefined;
  readonly onRebalanceNeeded: ((rank: LexoBucketRank) => void) | undefined;

  constructor(bucket: string, value: string, config: LexoBucketRankConfig = {}) {
    assertString(bucket, "bucket");
    assertString(value, "value");
    assertRankLength(value, "value");
    const alphabet = config.alphabet ?? BASE36;
    const buckets = config.buckets ?? DEFAULT_BUCKETS;
    const bucketSeparator = config.bucketSeparator ?? DEFAULT_BUCKET_SEPARATOR;

    validateBuckets(buckets);
    if (!buckets.includes(bucket)) {
      throw new Error(`Bucket '${bucket}' is not one of [${buckets.join(", ")}]`);
    }
    validateBucketSeparator(bucketSeparator, alphabet, buckets);
    alphabet.validate(value);
    if (value.length === 0) {
      throw new Error("Rank value cannot be empty");
    }

    this.bucket = bucket;
    this.value = value;
    this.alphabet = alphabet;
    this.buckets = buckets;
    this.bucketSeparator = bucketSeparator;
    this.rebalanceThreshold = config.rebalanceThreshold;
    this.onRebalanceNeeded = config.onRebalanceNeeded;
  }

  static min(config: LexoBucketRankConfig = {}): LexoBucketRank {
    const alphabet = config.alphabet ?? BASE36;
    const bucket = resolveActiveBucket(config);
    return new LexoBucketRank(bucket, alphabet.charAt(1), config);
  }

  static max(config: LexoBucketRankConfig = {}): LexoBucketRank {
    const alphabet = config.alphabet ?? BASE36;
    const bucket = resolveActiveBucket(config);
    return new LexoBucketRank(bucket, alphabet.charAt(alphabet.size - 2), config);
  }

  static middle(config: LexoBucketRankConfig = {}): LexoBucketRank {
    const alphabet = config.alphabet ?? BASE36;
    const bucket = resolveActiveBucket(config);
    return new LexoBucketRank(bucket, alphabet.charAt(alphabet.size >> 1), config);
  }

  static parse(raw: string, config: LexoBucketRankConfig = {}): LexoBucketRank {
    assertString(raw, "raw");
    const bucketSeparator = config.bucketSeparator ?? DEFAULT_BUCKET_SEPARATOR;
    const i = raw.indexOf(bucketSeparator);
    if (i === -1) {
      throw new Error(`Rank '${raw}' is missing bucket separator '${bucketSeparator}'`);
    }
    return new LexoBucketRank(
      raw.slice(0, i),
      raw.slice(i + bucketSeparator.length),
      config
    );
  }

  /**
   * Generate `count` ranks roughly evenly spaced across the safe range of
   * the active bucket (controlled by `config.activeBucket`, default
   * `buckets[0]`).
   */
  static evenlySpaced(
    count: number,
    config: LexoBucketRankConfig = {}
  ): LexoBucketRank[] {
    return evenlySpaced(LexoBucketRank.min(config), LexoBucketRank.max(config), count);
  }

  /**
   * Generate `count` ranks evenly spaced in an explicitly-named bucket. The
   * canonical migration helper: compute the target bucket yourself (usually
   * "the next one after what your live traffic is using") and call this to
   * get fresh short ranks in it.
   */
  static evenlySpacedInBucket(
    bucketName: string,
    count: number,
    config: LexoBucketRankConfig = {}
  ): LexoBucketRank[] {
    const targeted = { ...config, activeBucket: bucketName };
    return evenlySpaced(
      LexoBucketRank.min(targeted),
      LexoBucketRank.max(targeted),
      count
    );
  }

  static between(a: LexoBucketRank, b: LexoBucketRank): LexoBucketRank {
    assertSameConfig(a, b);
    if (a.bucket !== b.bucket) {
      throw new Error(
        `Cannot compute between ranks in different buckets ('${a.bucket}' vs '${b.bucket}')`
      );
    }
    const [lo, hi] = a.value < b.value ? [a, b] : [b, a];
    const value = genBetween(lo.value, hi.value, a.alphabet);
    // Inherit `a`'s monitor, mirroring how we inherit `a.alphabet`.
    const result = new LexoBucketRank(a.bucket, value, a.#config());
    maybeFireRebalanceMonitor(result, a);
    return result;
  }

  toString(): string {
    return `${this.bucket}${this.bucketSeparator}${this.value}`;
  }

  compareTo(other: LexoBucketRank): number {
    // Comparisons across buckets use the rendered string so the ordering is
    // well-defined and stable in a sorted database column. The typical use
    // case is comparing within a single bucket.
    const a = this.toString();
    const b = other.toString();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  equals(other: LexoBucketRank): boolean {
    return (
      this.bucket === other.bucket &&
      this.value === other.value &&
      this.alphabet === other.alphabet &&
      this.bucketSeparator === other.bucketSeparator
    );
  }

  getBucket(): string {
    return this.bucket;
  }

  /** Move this rank into the named bucket, preserving its value. */
  inBucket(bucketName: string): LexoBucketRank {
    if (!this.buckets.includes(bucketName)) {
      throw new Error(
        `Bucket '${bucketName}' is not one of [${this.buckets.join(", ")}]`
      );
    }
    return new LexoBucketRank(bucketName, this.value, this.#config());
  }

  genNext(): LexoBucketRank {
    const absMax = this.alphabet.charAt(this.alphabet.size - 1);
    const result = new LexoBucketRank(
      this.bucket,
      genBetween(this.value, absMax, this.alphabet),
      this.#config()
    );
    maybeFireRebalanceMonitor(result, this);
    return result;
  }

  genPrev(): LexoBucketRank {
    const absMin = this.alphabet.charAt(0);
    const result = new LexoBucketRank(
      this.bucket,
      genBetween(absMin, this.value, this.alphabet),
      this.#config()
    );
    maybeFireRebalanceMonitor(result, this);
    return result;
  }

  between(other: LexoBucketRank): LexoBucketRank {
    return LexoBucketRank.between(this, other);
  }

  #config(): LexoBucketRankConfig {
    return {
      alphabet: this.alphabet,
      buckets: this.buckets,
      bucketSeparator: this.bucketSeparator,
      // The instance's own bucket is the natural active bucket for any rank
      // derived from it (via between / genNext / genPrev / inBucket).
      activeBucket: this.bucket,
      ...(this.rebalanceThreshold !== undefined
        ? { rebalanceThreshold: this.rebalanceThreshold }
        : {}),
      ...(this.onRebalanceNeeded !== undefined
        ? { onRebalanceNeeded: this.onRebalanceNeeded }
        : {})
    };
  }
}

/**
 * Validate a bucket list. Rules:
 *
 * - non-empty (otherwise nothing can be constructed)
 * - every identifier is exactly one character (keeps rendered ranks aligned:
 *   bucket at position 0, separator at position 1, rank from position 2)
 * - no duplicates (would render identical rank strings)
 * - strictly lexicographically ascending (so the bucket array order matches
 *   the lex order of the rendered rank strings — important so rebalancing
 *   into a later bucket preserves total order across the migration)
 */
/**
 * Resolve which bucket `min`/`max`/`middle`/`evenlySpaced` should target for
 * a given config. Falls back to `buckets[0]` when `activeBucket` isn't set.
 * Throws if the provided `activeBucket` isn't one of the configured buckets.
 */
export function resolveActiveBucket(config: {
  buckets?: readonly string[];
  activeBucket?: string;
}): string {
  const buckets = config.buckets ?? DEFAULT_BUCKETS;
  if (config.activeBucket !== undefined) {
    if (!buckets.includes(config.activeBucket)) {
      throw new Error(
        `activeBucket '${config.activeBucket}' must be one of [${buckets.join(", ")}]`
      );
    }
    return config.activeBucket;
  }
  return buckets[0]!;
}

export function validateBuckets(buckets: readonly string[]): void {
  if (buckets.length < 2) {
    throw new Error(
      `Bucket list must contain at least 2 identifiers (got ${buckets.length}); ` +
        `a single bucket disables rebalancing`
    );
  }
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    if (b.length !== 1) {
      throw new Error(`Bucket identifier must be exactly one character (got '${b}')`);
    }
    if (i > 0) {
      const prev = buckets[i - 1]!;
      if (prev === b) {
        throw new Error(`Duplicate bucket identifier '${b}'`);
      }
      if (prev > b) {
        throw new Error(
          `Bucket identifiers must be strictly lexicographically ascending ('${prev}' comes before '${b}')`
        );
      }
    }
  }
}

/**
 * Enforce the same guarantees we give for the decimal separator — single
 * character, not in the alphabet — plus a bucket-specific one: the separator
 * must not appear in any bucket identifier, otherwise `parse` (which splits
 * on the first occurrence) would land in the wrong position.
 */
export function validateBucketSeparator(
  separator: string,
  alphabet: Alphabet,
  buckets: readonly string[]
): void {
  if (separator.length !== 1) {
    throw new Error(`Bucket separator must be a single character (got '${separator}')`);
  }
  if (alphabet.chars.includes(separator)) {
    throw new Error(`Bucket separator '${separator}' must not be part of the alphabet`);
  }
  for (const b of buckets) {
    if (b.includes(separator)) {
      throw new Error(
        `Bucket separator '${separator}' must not appear in any bucket identifier (found in '${b}')`
      );
    }
  }
}

/**
 * Guard against combining two ranks that were built with incompatible configs.
 * Same-alphabet is strict identity (not structural) because the alphabet
 * indexing Map is tied to a specific instance.
 */
function assertSameConfig(a: LexoBucketRank, b: LexoBucketRank): void {
  if (a.alphabet !== b.alphabet) {
    throw new Error("Cannot compute between ranks with different alphabets");
  }
  if (a.bucketSeparator !== b.bucketSeparator) {
    throw new Error(
      `Cannot compute between ranks with different bucket separators ('${a.bucketSeparator}' vs '${b.bucketSeparator}')`
    );
  }
  if (a.buckets !== b.buckets) {
    // Structural check as a fallback — two arrays with the same contents are
    // still compatible even if they're different instances.
    if (
      a.buckets.length !== b.buckets.length ||
      a.buckets.some((v, i) => v !== b.buckets[i])
    ) {
      throw new Error("Cannot compute between ranks with different bucket lists");
    }
  }
}
