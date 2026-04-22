import { describe, it, expect } from "vitest";
import { LexoRank } from "../src/ranks/lexo-rank";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";
import { LexoDecimalRank } from "../src/ranks/lexo-decimal-rank";
import { LexoBucketDecimalRank } from "../src/ranks/lexo-bucket-decimal-rank";
import { createLexoRank } from "../src/factory";
import { LOWER_ALPHA } from "../src/alphabet";

// Static class methods + factory-module methods built on top of the generic
// `evenlySpaced` helper. The helper itself is covered separately; these tests
// verify the per-mode config threading and the activeBucket / inBucket /
// evenlySpacedInBucket migration APIs.

describe("LexoRank.evenlySpaced", () => {
  it("defaults to BASE36 min/max bounds", () => {
    const ranks = LexoRank.evenlySpaced(5);
    expect(ranks).toHaveLength(5);
    for (const r of ranks) {
      expect(LexoRank.min().compareTo(r)).toBe(-1);
      expect(r.compareTo(LexoRank.max())).toBe(-1);
    }
  });

  it("uses the provided alphabet", () => {
    const ranks = LexoRank.evenlySpaced(5, LOWER_ALPHA);
    for (const r of ranks) LOWER_ALPHA.validate(r.value);
  });
});

describe("LexoBucketRank — activeBucket and evenlySpacedInBucket", () => {
  it("evenlySpaced uses buckets[0] by default", () => {
    const ranks = LexoBucketRank.evenlySpaced(6);
    expect(ranks.every((r) => r.bucket === "0")).toBe(true);
  });

  it("evenlySpaced respects activeBucket in config", () => {
    const ranks = LexoBucketRank.evenlySpaced(6, { activeBucket: "1" });
    expect(ranks.every((r) => r.bucket === "1")).toBe(true);
  });

  it("min / max / middle respect activeBucket", () => {
    const cfg = { activeBucket: "2" };
    expect(LexoBucketRank.min(cfg).bucket).toBe("2");
    expect(LexoBucketRank.max(cfg).bucket).toBe("2");
    expect(LexoBucketRank.middle(cfg).bucket).toBe("2");
  });

  it("evenlySpacedInBucket targets an explicitly-named bucket", () => {
    const ranks = LexoBucketRank.evenlySpacedInBucket("2", 6);
    expect(ranks).toHaveLength(6);
    expect(ranks.every((r) => r.bucket === "2")).toBe(true);
  });

  it("rejects an activeBucket that isn't in buckets", () => {
    expect(() => LexoBucketRank.min({ activeBucket: "9" })).toThrow(/must be one of/);
  });

  it("inBucket moves to a specific bucket and validates membership", () => {
    const r = LexoBucketRank.middle(); // "0|i"
    expect(r.inBucket("2").bucket).toBe("2");
    expect(() => r.inBucket("9")).toThrow(/not one of/);
  });

  it("ordering is preserved across buckets (migration invariant)", () => {
    const cur = LexoBucketRank.evenlySpaced(5, { activeBucket: "0" });
    const next = LexoBucketRank.evenlySpacedInBucket("1", 5);
    for (const a of cur) {
      for (const b of next) {
        expect(a.compareTo(b)).toBe(-1);
      }
    }
  });
});

describe("LexoDecimalRank.evenlySpaced", () => {
  it("produces ordered, within-bounds ranks", () => {
    const ranks = LexoDecimalRank.evenlySpaced(4, { integerWidth: 2 });
    expect(ranks).toHaveLength(4);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]!.compareTo(ranks[i]!)).toBe(-1);
    }
  });
});

describe("LexoBucketDecimalRank — activeBucket, inBucket, evenlySpacedInBucket", () => {
  it("evenlySpaced respects activeBucket", () => {
    const ranks = LexoBucketDecimalRank.evenlySpaced(4, { activeBucket: "1" });
    expect(ranks.every((r) => r.bucket === "1")).toBe(true);
  });

  it("evenlySpacedInBucket targets a named bucket", () => {
    const ranks = LexoBucketDecimalRank.evenlySpacedInBucket("2", 4);
    expect(ranks.every((r) => r.bucket === "2")).toBe(true);
  });

  it("inBucket jumps to the named bucket and preserves integer/decimal", () => {
    const r = new LexoBucketDecimalRank("0", "hzzz", "abc");
    const moved = r.inBucket("2");
    expect(moved.bucket).toBe("2");
    expect(moved.integer).toBe(r.integer);
    expect(moved.decimal).toBe(r.decimal);
  });
});

describe("createLexoRank module — activeBucket + evenlySpacedInBucket", () => {
  it("simple mode exposes evenlySpaced only", () => {
    const R = createLexoRank();
    expect(R.evenlySpaced(3)).toHaveLength(3);
    expect(
      (R as unknown as { evenlySpacedInBucket?: unknown }).evenlySpacedInBucket
    ).toBeUndefined();
  });

  it("bucket mode exposes evenlySpaced and evenlySpacedInBucket", () => {
    const R = createLexoRank({ bucket: true });
    const cur = R.evenlySpaced(4);
    const target = R.evenlySpacedInBucket("2", 4);
    expect(cur.every((r) => r.bucket === "0")).toBe(true);
    expect(target.every((r) => r.bucket === "2")).toBe(true);
  });

  it("bucket mode honours activeBucket as the default target", () => {
    const R = createLexoRank({ bucket: true, activeBucket: "1" });
    const cur = R.evenlySpaced(4);
    expect(cur.every((r) => r.bucket === "1")).toBe(true);
  });

  it("decimal mode exposes evenlySpaced only", () => {
    const R = createLexoRank({ decimal: true });
    expect(R.evenlySpaced(3)).toHaveLength(3);
    expect(
      (R as unknown as { evenlySpacedInBucket?: unknown }).evenlySpacedInBucket
    ).toBeUndefined();
  });

  it("bucket + decimal mode works with activeBucket and evenlySpacedInBucket", () => {
    const R = createLexoRank({
      bucket: true,
      decimal: true,
      activeBucket: "1"
    });
    expect(R.evenlySpaced(4).every((r) => r.bucket === "1")).toBe(true);
    expect(R.evenlySpacedInBucket("2", 4).every((r) => r.bucket === "2")).toBe(true);
  });

  it("end-to-end migration scenario: 0 → 1 → 2", () => {
    // First migration: data is in "0", move to "1".
    const R0 = createLexoRank({ bucket: true, activeBucket: "0" });
    const originalRanks = R0.evenlySpaced(5);
    const firstMigration = R0.evenlySpacedInBucket("1", 5);
    expect(originalRanks.every((r) => r.bucket === "0")).toBe(true);
    expect(firstMigration.every((r) => r.bucket === "1")).toBe(true);

    // Flip activeBucket; now "1" is live.
    const R1 = createLexoRank({ bucket: true, activeBucket: "1" });
    expect(R1.evenlySpaced(3).every((r) => r.bucket === "1")).toBe(true);

    // Second migration: data is in "1", move to "2".
    const secondMigration = R1.evenlySpacedInBucket("2", 5);
    expect(secondMigration.every((r) => r.bucket === "2")).toBe(true);

    // Invariant across all three: bucket 0 ranks sort before 1 before 2.
    for (const a of originalRanks) {
      for (const b of firstMigration) expect(a.compareTo(b)).toBe(-1);
    }
    for (const a of firstMigration) {
      for (const b of secondMigration) expect(a.compareTo(b)).toBe(-1);
    }
  });

  it("threads bucket/alphabet config through evenlySpaced", () => {
    const R = createLexoRank({
      bucket: true,
      alphabet: LOWER_ALPHA,
      buckets: ["a", "b", "c"]
    });
    const ranks = R.evenlySpaced(3);
    expect(ranks.every((r) => r.bucket === "a")).toBe(true);
    for (const r of ranks) LOWER_ALPHA.validate(r.value);
  });
});
