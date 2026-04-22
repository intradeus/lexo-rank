import { BASE36, type Alphabet } from "../alphabet";
import { assertRankLength, assertString } from "../algorithm/between";
import { decimalBetween, decimalLess } from "../algorithm/decimal-between";
import { evenlySpaced } from "../evenly-spaced";
import { maybeFireRebalanceMonitor, type RebalanceMonitor } from "../rebalance-monitor";

export const DEFAULT_DECIMAL_SEPARATOR = ":";
export const DEFAULT_INTEGER_WIDTH = 6;
/** Upper bound on `integerWidth` to catch accidental huge values that would
 *  allocate gigabyte strings via `padEnd`. 256 is already absurdly high —
 *  36^256 slots is well beyond anything realistic. */
export const MAX_INTEGER_WIDTH = 256;

export interface LexoDecimalRankConfig extends RebalanceMonitor<LexoDecimalRank> {
  readonly alphabet?: Alphabet;
  readonly decimalSeparator?: string;
  /**
   * Fixed width of the integer part. Integers shorter than this are right-
   * padded with the alphabet's minimum character; longer integers are
   * rejected. Defaults to 6.
   *
   * Fixed width is what makes the decimal fallback meaningful — when the
   * integer space between two neighbours is exhausted at this width, new
   * ranks borrow length from the decimal instead of growing the integer.
   */
  readonly integerWidth?: number;
}

/**
 * A decimal-style LexoRank: `<integer><separator><decimal>`.
 *
 * The integer part is fixed-width (default 6 chars) and carries coarse
 * ordering. The decimal part is an optional variable-length refinement used
 * when two neighbours already live in adjacent integer slots at max width.
 * Empty-decimal ranks look like `i00000:`; dense refinements look like
 * `hzzzzz:m`.
 */
export class LexoDecimalRank {
  readonly integer: string;
  readonly decimal: string;
  readonly alphabet: Alphabet;
  readonly decimalSeparator: string;
  readonly integerWidth: number;
  readonly rebalanceThreshold: number | undefined;
  readonly onRebalanceNeeded: ((rank: LexoDecimalRank) => void) | undefined;

  constructor(integer: string, decimal: string, config: LexoDecimalRankConfig = {}) {
    assertString(integer, "integer");
    assertString(decimal, "decimal");
    assertRankLength(integer, "integer");
    assertRankLength(decimal, "decimal");
    const alphabet = config.alphabet ?? BASE36;
    const decimalSeparator = config.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR;
    const integerWidth = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;

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

    this.integer = integer.padEnd(integerWidth, alphabet.charAt(0));
    this.decimal = decimal;
    this.alphabet = alphabet;
    this.decimalSeparator = decimalSeparator;
    this.integerWidth = integerWidth;
    this.rebalanceThreshold = config.rebalanceThreshold;
    this.onRebalanceNeeded = config.onRebalanceNeeded;
  }

  static min(config: LexoDecimalRankConfig = {}): LexoDecimalRank {
    const alphabet = config.alphabet ?? BASE36;
    const width = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;
    validateIntegerWidth(width);
    // Use idx 1 at position 0 so the absolute minimum (all-min) is still
    // reachable below this via genPrev.
    const integer = alphabet.charAt(0).repeat(width - 1) + alphabet.charAt(1);
    return new LexoDecimalRank(integer, "", config);
  }

  static max(config: LexoDecimalRankConfig = {}): LexoDecimalRank {
    const alphabet = config.alphabet ?? BASE36;
    const width = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;
    validateIntegerWidth(width);
    const integer =
      alphabet.charAt(alphabet.size - 1).repeat(width - 1) +
      alphabet.charAt(alphabet.size - 2);
    return new LexoDecimalRank(integer, "", config);
  }

  static middle(config: LexoDecimalRankConfig = {}): LexoDecimalRank {
    const alphabet = config.alphabet ?? BASE36;
    const width = config.integerWidth ?? DEFAULT_INTEGER_WIDTH;
    validateIntegerWidth(width);
    const integer =
      alphabet.charAt(alphabet.size >> 1) + alphabet.charAt(0).repeat(width - 1);
    return new LexoDecimalRank(integer, "", config);
  }

  static between(a: LexoDecimalRank, b: LexoDecimalRank): LexoDecimalRank {
    assertSameConfig(a, b);
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
    const result = new LexoDecimalRank(integer, decimal, a.#config());
    maybeFireRebalanceMonitor(result, a);
    return result;
  }

  static parse(raw: string, config: LexoDecimalRankConfig = {}): LexoDecimalRank {
    assertString(raw, "raw");
    const decimalSeparator = config.decimalSeparator ?? DEFAULT_DECIMAL_SEPARATOR;
    const i = raw.indexOf(decimalSeparator);
    if (i === -1) {
      throw new Error(`Rank '${raw}' is missing decimal separator '${decimalSeparator}'`);
    }
    return new LexoDecimalRank(
      raw.slice(0, i),
      raw.slice(i + decimalSeparator.length),
      config
    );
  }

  /** Generate `count` ranks roughly evenly spaced across the safe range. */
  static evenlySpaced(
    count: number,
    config: LexoDecimalRankConfig = {}
  ): LexoDecimalRank[] {
    return evenlySpaced(LexoDecimalRank.min(config), LexoDecimalRank.max(config), count);
  }

  toString(): string {
    return `${this.integer}${this.decimalSeparator}${this.decimal}`;
  }

  compareTo(other: LexoDecimalRank): number {
    if (decimalLess(this.integer, this.decimal, other.integer, other.decimal)) {
      return -1;
    }
    if (decimalLess(other.integer, other.decimal, this.integer, this.decimal)) {
      return 1;
    }
    return 0;
  }

  equals(other: LexoDecimalRank): boolean {
    return (
      this.integer === other.integer &&
      this.decimal === other.decimal &&
      this.alphabet === other.alphabet &&
      this.decimalSeparator === other.decimalSeparator &&
      this.integerWidth === other.integerWidth
    );
  }

  genNext(): LexoDecimalRank {
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
    const result = new LexoDecimalRank(integer, decimal, this.#config());
    maybeFireRebalanceMonitor(result, this);
    return result;
  }

  genPrev(): LexoDecimalRank {
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
    const result = new LexoDecimalRank(integer, decimal, this.#config());
    maybeFireRebalanceMonitor(result, this);
    return result;
  }

  between(other: LexoDecimalRank): LexoDecimalRank {
    return LexoDecimalRank.between(this, other);
  }

  #config(): LexoDecimalRankConfig {
    return {
      alphabet: this.alphabet,
      decimalSeparator: this.decimalSeparator,
      integerWidth: this.integerWidth,
      ...(this.rebalanceThreshold !== undefined
        ? { rebalanceThreshold: this.rebalanceThreshold }
        : {}),
      ...(this.onRebalanceNeeded !== undefined
        ? { onRebalanceNeeded: this.onRebalanceNeeded }
        : {})
    };
  }
}

export function validateDecimalSeparator(separator: string, alphabet: Alphabet): void {
  if (separator.length !== 1) {
    throw new Error(`Decimal separator must be a single character (got '${separator}')`);
  }
  if (alphabet.chars.includes(separator)) {
    throw new Error(`Decimal separator '${separator}' must not be part of the alphabet`);
  }
}

/**
 * Validate that `integerWidth` is a positive integer in a sensible range.
 *
 * Catches:
 * - non-numbers / NaN / Infinity (would silently break downstream math)
 * - non-integers (fractional widths don't make sense here)
 * - zero or negative (breaks `repeat(width - 1)` in static factories)
 * - absurdly large values (would allocate GB-scale strings via `padEnd`)
 */
export function validateIntegerWidth(width: number): void {
  if (typeof width !== "number" || !Number.isFinite(width) || Number.isNaN(width)) {
    throw new Error(`integerWidth must be a finite number (got ${String(width)})`);
  }
  if (!Number.isInteger(width)) {
    throw new Error(`integerWidth must be an integer (got ${width})`);
  }
  if (width < 1) {
    throw new Error(`integerWidth must be at least 1 (got ${width})`);
  }
  if (width > MAX_INTEGER_WIDTH) {
    throw new Error(
      `integerWidth ${width} exceeds the maximum of ${MAX_INTEGER_WIDTH}; values this large would allocate huge strings`
    );
  }
}

function assertSameConfig(a: LexoDecimalRank, b: LexoDecimalRank): void {
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
