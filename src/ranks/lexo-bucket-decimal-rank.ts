import { BASE36, type Alphabet } from "../alphabet";
import { assertRankLength, assertString } from "../algorithm/between";
import { decimalBetween, decimalLess } from "../algorithm/decimal-between";
import { evenlySpaced } from "../evenly-spaced";
import {
  analyze as analyzeRanks,
  move as moveRank,
  nextBucketInRing,
  rankAfter as rankAfterHelper,
  rankBefore as rankBeforeHelper,
  rankBetween as rankBetweenHelper,
  safeParse,
  type AnalyzeOptions,
  type RankAnalysis,
  type RebalancePlan
} from "../helpers";
import { maybeFireRebalanceMonitor, type RebalanceMonitor } from "../rebalance-monitor";
import {
  DEFAULT_BUCKETS,
  DEFAULT_BUCKET_SEPARATOR,
  resolveActiveBucket,
  validateBucketSeparator,
  validateBuckets
} from "./lexo-bucket-rank";
import {
  DEFAULT_INTEGER_WIDTH,
  DEFAULT_DECIMAL_SEPARATOR,
  validateIntegerWidth,
  validateDecimalSeparator
} from "./lexo-decimal-rank";

export interface LexoBucketDecimalRankConfig extends RebalanceMonitor<LexoBucketDecimalRank> {
  readonly alphabet?: Alphabet;
  readonly buckets?: readonly string[];
  readonly bucketSeparator?: string;
  readonly decimalSeparator?: string;
  readonly integerWidth?: number;
  /**
   * Which bucket `min`/`max`/`middle`/`evenlySpaced` should target. Must be one
   * of `buckets`. Defaults to `buckets[0]`.
   */
  readonly activeBucket?: string;
}

/**
 * The full Jira-style rank: `<bucket><bucketSep><integer><decimalSep><decimal>`.
 *
 * Buckets scope global rebalancing — when the integer space in the current
 * bucket gets dense and decimals are growing long, move every row into the
 * next bucket and regenerate fresh short ranks there. The integer/decimal
 * split keeps rank strings short in the common case; neighbours only trigger
 * decimal growth once they share adjacent integers at the configured width.
 */
export class LexoBucketDecimalRank {
  readonly bucket: string;
  readonly integer: string;
  readonly decimal: string;
  readonly alphabet: Alphabet;
  readonly buckets: readonly string[];
  readonly bucketSeparator: string;
  readonly decimalSeparator: string;
  readonly integerWidth: number;
  readonly rebalanceThreshold: number | undefined;
  readonly rebalanceAvgThreshold: number | undefined;
  readonly onRebalanceNeeded: ((rank: LexoBucketDecimalRank) => void) | undefined;

  constructor(
    bucket: string,
    integer: string,
    decimal: string,
    config: LexoBucketDecimalRankConfig = {}
  ) {
    assertString(bucket, "bucket");
    assertString(integer, "integer");
    assertString(decimal, "decimal");
    assertRankLength(integer, "integer");
    assertRankLength(decimal, "decimal");
    const alphabet = config.alphabet ?? BASE36;
    const buckets = config.buckets ?? DEFAULT_BUCKETS;
    const bucketSeparator = config.bucketSeparator ?? DEFAULT_BUCKET_SEPARATOR;
    const decimalSeparator = config.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR;
    const integerWidth = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;

    validateBuckets(buckets);
    if (!buckets.includes(bucket)) {
      throw new Error(`Bucket '${bucket}' is not one of [${buckets.join(", ")}]`);
    }
    validateBucketSeparator(bucketSeparator, alphabet, buckets);
    validateDecimalSeparator(decimalSeparator, alphabet);
    validateIntegerWidth(integerWidth);
    if (integer.length === 0) {
      throw new Error("Integer part cannot be empty");
    }
    if (integer.length > integerWidth) {
      throw new Error(`Integer '${integer}' exceeds configured width ${integerWidth}`);
    }
    alphabet.validate(integer);
    alphabet.validate(decimal);

    this.bucket = bucket;
    this.integer = integer.padEnd(integerWidth, alphabet.charAt(0));
    this.decimal = decimal;
    this.alphabet = alphabet;
    this.buckets = buckets;
    this.bucketSeparator = bucketSeparator;
    this.decimalSeparator = decimalSeparator;
    this.integerWidth = integerWidth;
    this.rebalanceThreshold = config.rebalanceThreshold;
    this.rebalanceAvgThreshold = config.rebalanceAvgThreshold;
    this.onRebalanceNeeded = config.onRebalanceNeeded;
  }

  static min(config: LexoBucketDecimalRankConfig = {}): LexoBucketDecimalRank {
    const alphabet = config.alphabet ?? BASE36;
    const width = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;
    validateIntegerWidth(width);
    const bucket = resolveActiveBucket(config);
    const integer = alphabet.charAt(0).repeat(width - 1) + alphabet.charAt(1);
    return new LexoBucketDecimalRank(bucket, integer, "", config);
  }

  static max(config: LexoBucketDecimalRankConfig = {}): LexoBucketDecimalRank {
    const alphabet = config.alphabet ?? BASE36;
    const width = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;
    validateIntegerWidth(width);
    const bucket = resolveActiveBucket(config);
    const integer =
      alphabet.charAt(alphabet.size - 1).repeat(width - 1) +
      alphabet.charAt(alphabet.size - 2);
    return new LexoBucketDecimalRank(bucket, integer, "", config);
  }

  static middle(config: LexoBucketDecimalRankConfig = {}): LexoBucketDecimalRank {
    const alphabet = config.alphabet ?? BASE36;
    const width = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;
    validateIntegerWidth(width);
    const bucket = resolveActiveBucket(config);
    const integer =
      alphabet.charAt(alphabet.size >> 1) + alphabet.charAt(0).repeat(width - 1);
    return new LexoBucketDecimalRank(bucket, integer, "", config);
  }

  static between(
    a: LexoBucketDecimalRank,
    b: LexoBucketDecimalRank
  ): LexoBucketDecimalRank {
    assertSameConfig(a, b);
    if (a.bucket !== b.bucket) {
      throw new Error(
        `Cannot compute between ranks in different buckets ('${a.bucket}' vs '${b.bucket}')`
      );
    }
    const [lo, hi] = decimalLess(a.integer, a.decimal, b.integer, b.decimal)
      ? [a, b]
      : [b, a];
    const { integer, decimal } = decimalBetween(
      lo.integer,
      lo.decimal,
      hi.integer,
      hi.decimal,
      a.alphabet,
      a.integerWidth
    );
    const result = new LexoBucketDecimalRank(a.bucket, integer, decimal, a.#config());
    maybeFireRebalanceMonitor(result, a);
    return result;
  }

  static parse(
    raw: string,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank {
    assertString(raw, "raw");
    const bucketSeparator = config.bucketSeparator ?? DEFAULT_BUCKET_SEPARATOR;
    const decimalSeparator = config.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR;

    const bi = raw.indexOf(bucketSeparator);
    if (bi === -1) {
      throw new Error(`Rank '${raw}' is missing bucket separator '${bucketSeparator}'`);
    }
    const bucket = raw.slice(0, bi);
    const rest = raw.slice(bi + bucketSeparator.length);

    const si = rest.indexOf(decimalSeparator);
    if (si === -1) {
      throw new Error(`Rank '${raw}' is missing decimal separator '${decimalSeparator}'`);
    }
    const integer = rest.slice(0, si);
    const decimal = rest.slice(si + decimalSeparator.length);
    return new LexoBucketDecimalRank(bucket, integer, decimal, config);
  }

  /**
   * Generate `count` ranks roughly evenly spaced across the safe range of the
   * active bucket (controlled by `config.activeBucket`, default `buckets[0]`).
   */
  static evenlySpaced(
    count: number,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank[] {
    return evenlySpaced(
      LexoBucketDecimalRank.min(config),
      LexoBucketDecimalRank.max(config),
      count
    );
  }

  /**
   * Generate `count` ranks evenly spaced in an explicitly-named bucket. The
   * canonical migration helper: compute the target bucket yourself and call
   * this to get fresh short ranks in it.
   */
  static evenlySpacedInBucket(
    bucketName: string,
    count: number,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank[] {
    const targeted = { ...config, activeBucket: bucketName };
    return evenlySpaced(
      LexoBucketDecimalRank.min(targeted),
      LexoBucketDecimalRank.max(targeted),
      count
    );
  }

  toString(): string {
    return `${this.bucket}${this.bucketSeparator}${this.integer}${this.decimalSeparator}${this.decimal}`;
  }

  compareTo(other: LexoBucketDecimalRank): number {
    if (this.bucket !== other.bucket) {
      return this.bucket < other.bucket ? -1 : 1;
    }
    if (decimalLess(this.integer, this.decimal, other.integer, other.decimal)) {
      return -1;
    }
    if (decimalLess(other.integer, other.decimal, this.integer, this.decimal)) {
      return 1;
    }
    return 0;
  }

  equals(other: LexoBucketDecimalRank): boolean {
    return (
      this.bucket === other.bucket &&
      this.integer === other.integer &&
      this.decimal === other.decimal &&
      this.alphabet === other.alphabet &&
      this.bucketSeparator === other.bucketSeparator &&
      this.decimalSeparator === other.decimalSeparator &&
      this.integerWidth === other.integerWidth
    );
  }

  getBucket(): string {
    return this.bucket;
  }

  /** Move this rank into the named bucket, preserving integer and decimal. */
  inBucket(bucketName: string): LexoBucketDecimalRank {
    if (!this.buckets.includes(bucketName)) {
      throw new Error(
        `Bucket '${bucketName}' is not one of [${this.buckets.join(", ")}]`
      );
    }
    return new LexoBucketDecimalRank(
      bucketName,
      this.integer,
      this.decimal,
      this.#config()
    );
  }

  genNext(): LexoBucketDecimalRank {
    const absMax = this.alphabet.charAt(this.alphabet.size - 1);
    const absMaxInt = absMax.repeat(this.integerWidth);
    const { integer, decimal } = decimalBetween(
      this.integer,
      this.decimal,
      absMaxInt,
      "",
      this.alphabet,
      this.integerWidth
    );
    const result = new LexoBucketDecimalRank(
      this.bucket,
      integer,
      decimal,
      this.#config()
    );
    maybeFireRebalanceMonitor(result, this);
    return result;
  }

  genPrev(): LexoBucketDecimalRank {
    const absMin = this.alphabet.charAt(0);
    const absMinInt = absMin.repeat(this.integerWidth);
    if (this.integer === absMinInt && this.decimal === "") {
      throw new Error("No rank exists before the absolute minimum");
    }
    const { integer, decimal } = decimalBetween(
      absMinInt,
      "",
      this.integer,
      this.decimal,
      this.alphabet,
      this.integerWidth
    );
    const result = new LexoBucketDecimalRank(
      this.bucket,
      integer,
      decimal,
      this.#config()
    );
    maybeFireRebalanceMonitor(result, this);
    return result;
  }

  between(other: LexoBucketDecimalRank): LexoBucketDecimalRank {
    return LexoBucketDecimalRank.between(this, other);
  }

  /** Drag-and-drop helper; falls back to `middle(config)` when `prev` is omitted. */
  static rankAfter(
    prev?: LexoBucketDecimalRank,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank {
    return rankAfterHelper(prev, () => LexoBucketDecimalRank.middle(config));
  }

  /** Symmetric to `rankAfter`. */
  static rankBefore(
    next?: LexoBucketDecimalRank,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank {
    return rankBeforeHelper(next, () => LexoBucketDecimalRank.middle(config));
  }

  /** Combined variant — covers every insertion boundary. */
  static rankBetween(
    a?: LexoBucketDecimalRank,
    b?: LexoBucketDecimalRank,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank {
    return rankBetweenHelper(a, b, () => LexoBucketDecimalRank.middle(config));
  }

  /** Sort comparator, usable unbound with `Array#sort`. */
  static compare(this: void, a: LexoBucketDecimalRank, b: LexoBucketDecimalRank): number {
    return a.compareTo(b);
  }

  /** Non-throwing parse under the given config. */
  static isValid(raw: unknown, config: LexoBucketDecimalRankConfig = {}): boolean {
    if (typeof raw !== "string") return false;
    return safeParse(() => LexoBucketDecimalRank.parse(raw, config)) !== undefined;
  }

  /** See `LexoRank.move`. */
  static move(
    list: readonly LexoBucketDecimalRank[],
    from: number,
    to: number,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank {
    return moveRank(list, from, to, () => LexoBucketDecimalRank.middle(config));
  }

  /** See `RankAnalysis`. */
  static analyze(
    ranks: readonly LexoBucketDecimalRank[],
    options?: AnalyzeOptions
  ): RankAnalysis {
    return analyzeRanks(ranks, options);
  }

  /** Non-throwing `parse`. See `LexoRank.safeParse`. */
  static safeParse(
    raw: unknown,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank | undefined {
    if (typeof raw !== "string") return undefined;
    return safeParse(() => LexoBucketDecimalRank.parse(raw, config));
  }

  /** Non-throwing `rankAfter`. */
  static safeRankAfter(
    prev?: LexoBucketDecimalRank,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank | undefined {
    return safeParse(() => LexoBucketDecimalRank.rankAfter(prev, config));
  }

  /** Non-throwing `rankBefore`. */
  static safeRankBefore(
    next?: LexoBucketDecimalRank,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank | undefined {
    return safeParse(() => LexoBucketDecimalRank.rankBefore(next, config));
  }

  /** Non-throwing `rankBetween`. */
  static safeRankBetween(
    a?: LexoBucketDecimalRank,
    b?: LexoBucketDecimalRank,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank | undefined {
    return safeParse(() => LexoBucketDecimalRank.rankBetween(a, b, config));
  }

  /** Non-throwing `move`. */
  static safeMove(
    list: readonly LexoBucketDecimalRank[],
    from: number,
    to: number,
    config: LexoBucketDecimalRankConfig = {}
  ): LexoBucketDecimalRank | undefined {
    return safeParse(() => LexoBucketDecimalRank.move(list, from, to, config));
  }

  /** See `LexoBucketRank.planRebalance`. */
  static planRebalance(
    currentBucket?: string,
    config: LexoBucketDecimalRankConfig = {}
  ): RebalancePlan<LexoBucketDecimalRank> {
    const buckets = config.buckets ?? DEFAULT_BUCKETS;
    validateBuckets(buckets);
    const current = currentBucket ?? config.activeBucket ?? buckets[0]!;
    const { target, isWrap } = nextBucketInRing(buckets, current);
    return {
      currentBucket: current,
      targetBucket: target,
      isWrap,
      ranks: (count: number) =>
        LexoBucketDecimalRank.evenlySpacedInBucket(target, count, config)
    };
  }

  #config(): LexoBucketDecimalRankConfig {
    return {
      alphabet: this.alphabet,
      buckets: this.buckets,
      bucketSeparator: this.bucketSeparator,
      decimalSeparator: this.decimalSeparator,
      integerWidth: this.integerWidth,
      activeBucket: this.bucket,
      ...(this.rebalanceThreshold !== undefined
        ? { rebalanceThreshold: this.rebalanceThreshold }
        : {}),
      ...(this.rebalanceAvgThreshold !== undefined
        ? { rebalanceAvgThreshold: this.rebalanceAvgThreshold }
        : {}),
      ...(this.onRebalanceNeeded !== undefined
        ? { onRebalanceNeeded: this.onRebalanceNeeded }
        : {})
    };
  }
}

function assertSameConfig(a: LexoBucketDecimalRank, b: LexoBucketDecimalRank): void {
  if (a.alphabet !== b.alphabet) {
    throw new Error("Cannot compute between ranks with different alphabets");
  }
  if (a.decimalSeparator !== b.decimalSeparator) {
    throw new Error("Cannot compute between ranks with different decimal separators");
  }
  if (a.integerWidth !== b.integerWidth) {
    throw new Error("Cannot compute between ranks with different integer widths");
  }
}
