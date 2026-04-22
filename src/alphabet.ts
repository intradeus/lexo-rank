/**
 * An Alphabet is an ordered set of characters used to build ranks.
 * The characters MUST be strictly ascending in their intrinsic code-point
 * order so that lexicographic string comparison agrees with the abstract
 * digit order.
 */
export interface Alphabet {
  readonly chars: string;
  readonly size: number;
  indexOf(c: string): number;
  charAt(i: number): string;
  validate(rank: string): void;
}

export class StringAlphabet implements Alphabet {
  readonly chars: string;
  readonly size: number;
  private readonly indices: Map<string, number>;

  constructor(chars: string) {
    if (chars.length < 4) {
      throw new Error("Alphabet must contain at least 4 characters");
    }
    // Reject non-BMP characters (anything needing UTF-16 surrogate pairs).
    // The class indexes by UTF-16 code unit internally, so a surrogate pair
    // would get split across two "positions" and produce unpaired surrogates
    // at `charAt()`. The code-point count (`[...chars].length`) matches the
    // code-unit count iff every character is a single UTF-16 code unit.
    if ([...chars].length !== chars.length) {
      throw new Error(
        "Alphabet must contain only single UTF-16 code units (BMP characters); " +
          "surrogate pairs (e.g. most emoji) are not supported"
      );
    }
    const seen = new Set<string>();
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]!;
      if (seen.has(c)) {
        throw new Error(`Alphabet contains duplicate character '${c}'`);
      }
      seen.add(c);
      if (i > 0 && chars[i - 1]! >= c) {
        throw new Error(
          `Alphabet characters must be strictly ascending ('${chars[i - 1]}' >= '${c}')`
        );
      }
    }
    this.chars = chars;
    this.size = chars.length;
    this.indices = new Map();
    for (let i = 0; i < chars.length; i++) {
      this.indices.set(chars[i]!, i);
    }
  }

  indexOf(c: string): number {
    const i = this.indices.get(c);
    if (i === undefined) {
      throw new Error(`Character '${c}' is not in alphabet`);
    }
    return i;
  }

  charAt(i: number): string {
    if (i < 0 || i >= this.size) {
      throw new Error(`Alphabet index ${i} out of range [0, ${this.size})`);
    }
    return this.chars[i]!;
  }

  validate(rank: string): void {
    for (const c of rank) {
      if (!this.indices.has(c)) {
        throw new Error(`Rank '${rank}' contains invalid character '${c}'`);
      }
    }
  }
}

export const NUMERIC: Alphabet = new StringAlphabet("0123456789");
export const LOWER_ALPHA: Alphabet = new StringAlphabet("abcdefghijklmnopqrstuvwxyz");
export const UPPER_ALPHA: Alphabet = new StringAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
export const BASE36: Alphabet = new StringAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz"
);
export const BASE62: Alphabet = new StringAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
);

/**
 * Build the smallest valid alphabet that covers every character in the given
 * sample ranks. Useful when migrating from an existing rank store where the
 * alphabet is unknown upfront.
 */
export function alphabetFromSamples(samples: readonly string[]): StringAlphabet {
  const set = new Set<string>();
  for (const s of samples) {
    for (const c of s) set.add(c);
  }
  if (set.size < 4) {
    throw new Error(
      `Samples cover only ${set.size} unique character(s); need at least 4`
    );
  }
  return new StringAlphabet([...set].sort().join(""));
}

/**
 * Expand a range specification (e.g. '0-9a-z', 'A-Z', 'abc') into an Alphabet.
 * Ranges are inclusive and use code-point order. Standalone characters are
 * allowed. Duplicates are deduplicated and the resulting alphabet is sorted.
 */
export function alphabetFromRange(spec: string): StringAlphabet {
  if (spec.length === 0) throw new Error("Range spec is empty");
  const chars: string[] = [];
  let i = 0;
  while (i < spec.length) {
    const isRange = i + 2 < spec.length && spec[i + 1] === "-";
    // Detect clearly-malformed ranges rather than silently treating '-' as a
    // literal character. "a-" at end is almost certainly an incomplete range.
    if (!isRange && i + 1 === spec.length - 1 && spec[i + 1] === "-") {
      throw new Error(
        `Range spec '${spec}' ends with '${spec[i]}-': range has no end character`
      );
    }
    if (isRange) {
      const start = spec.charCodeAt(i);
      const end = spec.charCodeAt(i + 2);
      if (end < start) {
        throw new Error(`Invalid range '${spec[i]}-${spec[i + 2]}' (end before start)`);
      }
      for (let c = start; c <= end; c++) {
        chars.push(String.fromCharCode(c));
      }
      i += 3;
    } else {
      chars.push(spec[i]!);
      i++;
    }
  }
  const unique = [...new Set(chars)].sort();
  return new StringAlphabet(unique.join(""));
}
