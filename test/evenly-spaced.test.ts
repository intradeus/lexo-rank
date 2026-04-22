import { describe, it, expect } from "vitest";
import { evenlySpaced } from "../src/evenly-spaced";
import { LexoRank } from "../src/ranks/lexo-rank";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";
import { LexoDecimalRank } from "../src/ranks/lexo-decimal-rank";
import { LexoBucketDecimalRank } from "../src/ranks/lexo-bucket-decimal-rank";
import { LOWER_ALPHA, NUMERIC } from "../src/alphabet";

describe("evenlySpaced — basics", () => {
  it("returns an empty array for count 0", () => {
    const result = evenlySpaced(LexoRank.min(), LexoRank.max(), 0);
    expect(result).toEqual([]);
  });

  it("returns a single rank strictly between lo and hi for count 1", () => {
    const lo = LexoRank.min();
    const hi = LexoRank.max();
    const [r] = evenlySpaced(lo, hi, 1);
    expect(r).toBeDefined();
    expect(lo.compareTo(r!)).toBe(-1);
    expect(r!.compareTo(hi)).toBe(-1);
  });

  it("throws for negative count", () => {
    expect(() => evenlySpaced(LexoRank.min(), LexoRank.max(), -1)).toThrow(
      /non-negative integer/
    );
  });

  it("throws for fractional count", () => {
    expect(() => evenlySpaced(LexoRank.min(), LexoRank.max(), 3.5)).toThrow(
      /non-negative integer/
    );
  });

  it("throws for NaN count", () => {
    expect(() => evenlySpaced(LexoRank.min(), LexoRank.max(), NaN)).toThrow(
      /non-negative integer/
    );
  });
});

describe("evenlySpaced — ordering invariants", () => {
  it("produces ranks strictly between lo and hi, in strictly ascending order", () => {
    const lo = LexoRank.min();
    const hi = LexoRank.max();
    const result = evenlySpaced(lo, hi, 20);

    expect(result).toHaveLength(20);
    for (const r of result) {
      expect(lo.compareTo(r)).toBe(-1);
      expect(r.compareTo(hi)).toBe(-1);
    }
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.compareTo(result[i]!)).toBe(-1);
    }
  });

  it("keeps ranks short for large counts (logarithmic length growth)", () => {
    const lo = LexoRank.min();
    const hi = LexoRank.max();
    const result = evenlySpaced(lo, hi, 1000);

    // A naive left-to-right fill would give an O(N) worst-case length. The
    // binary-split approach caps length at O(log N) — for 1000 items on a
    // base-36 alphabet that's around 4–6 chars in practice. Allow some slack
    // for implementation variance.
    const maxLen = Math.max(...result.map((r) => r.toString().length));
    expect(maxLen).toBeLessThanOrEqual(12);
  });
});

describe("evenlySpaced — works across all four modes", () => {
  it("LexoRank", () => {
    const result = evenlySpaced(LexoRank.min(), LexoRank.max(), 5);
    expect(result).toHaveLength(5);
    expect(result.every((r) => r instanceof LexoRank)).toBe(true);
  });

  it("LexoBucketRank", () => {
    const lo = LexoBucketRank.min();
    const hi = LexoBucketRank.max();
    const result = evenlySpaced(lo, hi, 5);
    expect(result).toHaveLength(5);
    expect(result.every((r) => r instanceof LexoBucketRank)).toBe(true);
    expect(result.every((r) => r.bucket === lo.bucket)).toBe(true);
  });

  it("LexoDecimalRank", () => {
    const lo = LexoDecimalRank.min();
    const hi = LexoDecimalRank.max();
    const result = evenlySpaced(lo, hi, 5);
    expect(result).toHaveLength(5);
    expect(result.every((r) => r instanceof LexoDecimalRank)).toBe(true);
  });

  it("LexoBucketDecimalRank", () => {
    const lo = LexoBucketDecimalRank.min();
    const hi = LexoBucketDecimalRank.max();
    const result = evenlySpaced(lo, hi, 5);
    expect(result).toHaveLength(5);
    expect(result.every((r) => r instanceof LexoBucketDecimalRank)).toBe(true);
    expect(result.every((r) => r.bucket === lo.bucket)).toBe(true);
  });
});

describe("evenlySpaced — custom alphabets", () => {
  it("respects a NUMERIC alphabet", () => {
    const lo = LexoRank.min(NUMERIC);
    const hi = LexoRank.max(NUMERIC);
    const result = evenlySpaced(lo, hi, 7);
    expect(result).toHaveLength(7);
    for (const r of result) {
      NUMERIC.validate(r.value);
    }
  });

  it("respects a LOWER_ALPHA alphabet", () => {
    const lo = LexoRank.min(LOWER_ALPHA);
    const hi = LexoRank.max(LOWER_ALPHA);
    const result = evenlySpaced(lo, hi, 10);
    expect(result).toHaveLength(10);
    for (const r of result) {
      LOWER_ALPHA.validate(r.value);
    }
  });
});

describe("evenlySpaced — rebalancing use case", () => {
  it("generates short fresh ranks suitable for migrating to a new bucket", () => {
    // Simulate: old bucket 0 had 100 rows with unwieldy ranks. Rebalance by
    // generating fresh ranks in bucket 1 spanning the full safe range.
    const cfg = { buckets: ["0", "1", "2"] };
    const lo = LexoBucketRank.min(cfg).inBucket("1");
    const hi = LexoBucketRank.max(cfg).inBucket("1");

    const fresh = evenlySpaced(lo, hi, 100);
    expect(fresh).toHaveLength(100);
    // All in bucket 1
    expect(fresh.every((r) => r.bucket === "1")).toBe(true);
    // Strictly ascending
    for (let i = 1; i < fresh.length; i++) {
      expect(fresh[i - 1]!.compareTo(fresh[i]!)).toBe(-1);
    }
    // All meaningfully shorter than ranks that might have prompted rebalancing
    const maxLen = Math.max(...fresh.map((r) => r.toString().length));
    expect(maxLen).toBeLessThan(15);
  });
});
