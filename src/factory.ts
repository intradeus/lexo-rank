import {
  alphabetFromRange,
  alphabetFromSamples,
  BASE36,
  type Alphabet
} from "./alphabet";
import { genBetween } from "./algorithm/between";
import { LexoRank } from "./ranks/lexo-rank";
import {
  DEFAULT_BUCKETS,
  DEFAULT_BUCKET_SEPARATOR,
  LexoBucketRank
} from "./ranks/lexo-bucket-rank";
import {
  DEFAULT_INTEGER_WIDTH,
  DEFAULT_DECIMAL_SEPARATOR,
  LexoDecimalRank
} from "./ranks/lexo-decimal-rank";
import { LexoBucketDecimalRank } from "./ranks/lexo-bucket-decimal-rank";

/**
 * Broadest rank type — useful when writing a handler that the factory
 * dispatches to one of the four concrete classes at runtime.
 */
export type AnyLexoRank =
  | LexoRank
  | LexoBucketRank
  | LexoDecimalRank
  | LexoBucketDecimalRank;

export interface CreateLexoRankOptions {
  /** Pre-built alphabet. Takes precedence over `range` and `samples`. */
  alphabet?: Alphabet;
  /**
   * Character range spec like `'0-9a-z'`, `'A-Za-z'`, or an explicit list
   * like `'abcxyz'`. Ranges use code-point order; duplicates are removed.
   */
  range?: string;
  /** Infer the smallest valid alphabet from these existing ranks. */
  samples?: readonly string[];
  /** Prefix ranks with a bucket (`<bucket><bucketSeparator>...`). */
  bucket?: boolean;
  /** Split ranks into an integer and a decimal part (`...<decimalSeparator><decimal>`). */
  decimal?: boolean;
  /** Bucket identifiers. Target one explicitly via `inBucket` / `evenlySpacedInBucket`. */
  buckets?: readonly string[];
  /** Character separating bucket from rank. Defaults to `'|'`. */
  bucketSeparator?: string;
  /** Character separating integer from decimal. Defaults to `':'`. */
  decimalSeparator?: string;
  /**
   * Fixed width of the integer part when `decimal` is enabled. Defaults to 6.
   * See `LexoDecimalRankConfig.integerWidth` for semantics.
   */
  integerWidth?: number;
  /**
   * Fire `onRebalanceNeeded` whenever a newly-constructed rank's rendered
   * length exceeds this number. Monitoring is only active when both
   * `rebalanceThreshold` and `onRebalanceNeeded` are provided.
   */
  rebalanceThreshold?: number;
  /**
   * Synchronous callback fired from the rank constructor when
   * `rebalanceThreshold` is exceeded. Runs once per rank construction that
   * exceeds the threshold — no deduping. The callback receives the broadest
   * rank type; narrow inside the handler if you want, or cast to the concrete
   * class you know you configured.
   */
  onRebalanceNeeded?: (rank: AnyLexoRank) => void;
  /**
   * Which bucket is the "live" one. Defaults to `buckets[0]`. Set this after
   * a migration so subsequent `min`/`max`/`middle`/`evenlySpaced` calls
   * target the new active bucket. Ignored when `bucket` is not enabled.
   */
  activeBucket?: string;
}

/**
 * Shared shape across all four variants. Return types are narrowed through
 * overloads so TypeScript knows which concrete class you get.
 */
export interface LexoRankModule<T> {
  readonly alphabet: Alphabet;
  readonly bucket: boolean;
  readonly decimal: boolean;
  min(): T;
  max(): T;
  middle(): T;
  between(a: T, b: T): T;
  parse(raw: string): T;
  from(raw: string): T;
  /** `count` ranks evenly spaced across the safe range of the active bucket. */
  evenlySpaced(count: number): T[];
}

/**
 * Bucket-specific extension. Adds `evenlySpacedInBucket`, which is the
 * canonical entry point for bulk rebalancing into a specific target bucket.
 */
export interface LexoBucketRankModule<T> extends LexoRankModule<T> {
  /** `count` ranks evenly spaced in the named bucket; for online migration. */
  evenlySpacedInBucket(bucketName: string, count: number): T[];
}

// Overloads: the concrete class depends on which booleans are set.
// Bucket variants return LexoBucketRankModule so `evenlySpacedInBucket`
// is visible to TypeScript only where it's meaningful.
export function createLexoRank(
  options: CreateLexoRankOptions & { bucket: true; decimal: true }
): LexoBucketRankModule<LexoBucketDecimalRank>;
export function createLexoRank(
  options: CreateLexoRankOptions & { bucket: true; decimal?: false | undefined }
): LexoBucketRankModule<LexoBucketRank>;
export function createLexoRank(
  options: CreateLexoRankOptions & { bucket?: false | undefined; decimal: true }
): LexoRankModule<LexoDecimalRank>;
export function createLexoRank(
  options?: CreateLexoRankOptions & {
    bucket?: false | undefined;
    decimal?: false | undefined;
  }
): LexoRankModule<LexoRank>;
export function createLexoRank(
  options: CreateLexoRankOptions = {}
):
  | LexoRankModule<LexoRank>
  | LexoBucketRankModule<LexoBucketRank>
  | LexoRankModule<LexoDecimalRank>
  | LexoBucketRankModule<LexoBucketDecimalRank> {
  // Guard against truthy-but-not-boolean inputs like `"yes"` or `1` that would
  // silently be treated as `false` by a strict `=== true` comparison. Better
  // to surface the misuse than let the caller think they opted into bucket/
  // decimal mode.
  assertBooleanOrUndefined(options.bucket, "options.bucket");
  assertBooleanOrUndefined(options.decimal, "options.decimal");
  const alphabet = resolveAlphabet(options);
  const bucket = options.bucket === true;
  const decimal = options.decimal === true;
  // The callback is typed broadly on `AnyLexoRank`; each class's config
  // expects a narrower `(rank: ThisClass) => void`. The cast is safe at
  // runtime because the constructor only ever passes its own instance.
  const monitorFields = buildMonitorFields(options);

  const activeBucket = options.activeBucket;

  if (bucket && decimal) {
    const config = {
      alphabet,
      buckets: options.buckets ?? DEFAULT_BUCKETS,
      bucketSeparator: options.bucketSeparator ?? DEFAULT_BUCKET_SEPARATOR,
      decimalSeparator: options.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR,
      integerWidth: options.integerWidth ?? DEFAULT_INTEGER_WIDTH,
      ...(activeBucket !== undefined ? { activeBucket } : {}),
      ...monitorFields
    };
    const mod: LexoBucketRankModule<LexoBucketDecimalRank> = {
      alphabet,
      bucket,
      decimal,
      min: () => LexoBucketDecimalRank.min(config),
      max: () => LexoBucketDecimalRank.max(config),
      middle: () => LexoBucketDecimalRank.middle(config),
      between: (a, b) => LexoBucketDecimalRank.between(a, b),
      parse: (raw) => LexoBucketDecimalRank.parse(raw, config),
      from: (raw) => LexoBucketDecimalRank.parse(raw, config),
      evenlySpaced: (count) => LexoBucketDecimalRank.evenlySpaced(count, config),
      evenlySpacedInBucket: (bucketName, count) =>
        LexoBucketDecimalRank.evenlySpacedInBucket(bucketName, count, config)
    };
    return mod;
  }

  if (bucket) {
    const config = {
      alphabet,
      buckets: options.buckets ?? DEFAULT_BUCKETS,
      bucketSeparator: options.bucketSeparator ?? DEFAULT_BUCKET_SEPARATOR,
      ...(activeBucket !== undefined ? { activeBucket } : {}),
      ...monitorFields
    };
    const mod: LexoBucketRankModule<LexoBucketRank> = {
      alphabet,
      bucket,
      decimal,
      min: () => LexoBucketRank.min(config),
      max: () => LexoBucketRank.max(config),
      middle: () => LexoBucketRank.middle(config),
      between: (a, b) => LexoBucketRank.between(a, b),
      parse: (raw) => LexoBucketRank.parse(raw, config),
      from: (raw) => LexoBucketRank.parse(raw, config),
      evenlySpaced: (count) => LexoBucketRank.evenlySpaced(count, config),
      evenlySpacedInBucket: (bucketName, count) =>
        LexoBucketRank.evenlySpacedInBucket(bucketName, count, config)
    };
    return mod;
  }

  if (decimal) {
    const config = {
      alphabet,
      decimalSeparator: options.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR,
      integerWidth: options.integerWidth ?? DEFAULT_INTEGER_WIDTH,
      ...monitorFields
    };
    const mod: LexoRankModule<LexoDecimalRank> = {
      alphabet,
      bucket,
      decimal,
      min: () => LexoDecimalRank.min(config),
      max: () => LexoDecimalRank.max(config),
      middle: () => LexoDecimalRank.middle(config),
      between: (a, b) => LexoDecimalRank.between(a, b),
      parse: (raw) => LexoDecimalRank.parse(raw, config),
      from: (raw) => LexoDecimalRank.parse(raw, config),
      evenlySpaced: (count) => LexoDecimalRank.evenlySpaced(count, config)
    };
    return mod;
  }

  const simpleMonitor = buildMonitorFields<LexoRank>(options);
  // LexoRank takes monitor as a direct 3rd arg rather than via a config
  // object; reshape the fields helper into that arity.
  const lrMonitor =
    simpleMonitor.rebalanceThreshold !== undefined ||
    simpleMonitor.onRebalanceNeeded !== undefined
      ? simpleMonitor
      : undefined;
  const mod: LexoRankModule<LexoRank> = {
    alphabet,
    bucket,
    decimal,
    min: () => LexoRank.min(alphabet, lrMonitor),
    max: () => LexoRank.max(alphabet, lrMonitor),
    middle: () => LexoRank.middle(alphabet, lrMonitor),
    between: (a, b) => LexoRank.between(a, b),
    parse: (raw) => new LexoRank(raw, alphabet, lrMonitor),
    from: (raw) => new LexoRank(raw, alphabet, lrMonitor),
    evenlySpaced: (count) => LexoRank.evenlySpaced(count, alphabet, lrMonitor)
  };
  return mod;
}

/**
 * Low-level helper that generates a rank between two raw strings under the
 * given alphabet. Exposed for callers who want to avoid allocating class
 * instances (e.g. hot bulk-generation paths).
 */
export function rankBetween(
  prev: string,
  next: string,
  alphabet: Alphabet = BASE36
): string {
  return genBetween(prev, next, alphabet);
}

function assertBooleanOrUndefined(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean if provided (got ${typeof value})`);
  }
}

/**
 * Build the monitor fields in a shape suitable for any of the four class
 * configs. We narrow the callback type via `as` because every class's
 * config expects a handler typed to its own concrete class; at runtime the
 * constructor only ever calls it with an instance of that class, so the
 * user's broader `AnyLexoRank` handler is always a valid receiver.
 */
function buildMonitorFields<T extends AnyLexoRank>(
  options: CreateLexoRankOptions
): { rebalanceThreshold?: number; onRebalanceNeeded?: (rank: T) => void } {
  const fields: {
    rebalanceThreshold?: number;
    onRebalanceNeeded?: (rank: T) => void;
  } = {};
  if (options.rebalanceThreshold !== undefined) {
    fields.rebalanceThreshold = options.rebalanceThreshold;
  }
  if (options.onRebalanceNeeded !== undefined) {
    fields.onRebalanceNeeded = options.onRebalanceNeeded;
  }
  return fields;
}

function resolveAlphabet(options: CreateLexoRankOptions): Alphabet {
  if (options.alphabet) return options.alphabet;
  if (options.range !== undefined) return alphabetFromRange(options.range);
  if (options.samples !== undefined) return alphabetFromSamples(options.samples);
  return BASE36;
}
