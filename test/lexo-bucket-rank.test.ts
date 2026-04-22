import { describe, it, expect } from "vitest";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";
import { LOWER_ALPHA, NUMERIC } from "../src/alphabet";

describe("LexoBucketRank", () => {
  it("formats as bucket|value", () => {
    const r = LexoBucketRank.middle();
    expect(r.toString()).toBe("0|i");
    expect(r.bucket).toBe("0");
    expect(r.value).toBe("i");
  });

  it("parses a raw rank string", () => {
    const r = LexoBucketRank.parse("1|abc");
    expect(r.bucket).toBe("1");
    expect(r.value).toBe("abc");
  });

  it("rejects unknown buckets", () => {
    expect(() => new LexoBucketRank("9", "a")).toThrow(/not one of/);
  });

  it("rejects multi-character bucket separators", () => {
    expect(() => new LexoBucketRank("0", "a", { bucketSeparator: "||" })).toThrow(
      /single character/
    );
  });

  it("rejects bucket separators that appear in the alphabet", () => {
    expect(() => new LexoBucketRank("0", "a", { bucketSeparator: "a" })).toThrow(
      /not be part of the alphabet/
    );
  });

  it("rejects bucket separators that appear in a bucket identifier", () => {
    // Bucket '|' overlaps the separator '|'.
    expect(
      () =>
        new LexoBucketRank("|", "a", {
          buckets: ["|", "~"],
          bucketSeparator: "|"
        })
    ).toThrow(/must not appear in any bucket identifier/);
  });

  it("rejects duplicate bucket identifiers", () => {
    expect(() => new LexoBucketRank("X", "a", { buckets: ["X", "X"] })).toThrow(
      /duplicate bucket identifier/i
    );
  });

  it("rejects out-of-order bucket identifiers", () => {
    expect(() => new LexoBucketRank("b", "a", { buckets: ["b", "a"] })).toThrow(
      /strictly lexicographically ascending/
    );
  });

  it("rejects multi-character bucket identifiers", () => {
    expect(() => new LexoBucketRank("AA", "a", { buckets: ["AA", "BB"] })).toThrow(
      /exactly one character/
    );
  });

  it("rejects a bucket list with fewer than 2 identifiers", () => {
    expect(() => new LexoBucketRank("0", "a", { buckets: [] })).toThrow(
      /at least 2 identifiers/
    );
    expect(() => new LexoBucketRank("X", "a", { buckets: ["X"] })).toThrow(
      /at least 2 identifiers/
    );
  });

  it("throws when parsing a raw string without a separator", () => {
    expect(() => LexoBucketRank.parse("no-pipe-here")).toThrow(/separator/);
  });

  it("produces ranks strictly between within the same bucket", () => {
    const lo = LexoBucketRank.min();
    const hi = LexoBucketRank.max();
    const mid = LexoBucketRank.between(lo, hi);
    expect(lo.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(hi)).toBe(-1);
    expect(mid.bucket).toBe("0");
  });

  it("refuses between ranks with different bucket separators", () => {
    const a = new LexoBucketRank("0", "m", { bucketSeparator: "|" });
    const b = new LexoBucketRank("0", "m", { bucketSeparator: "#" });
    expect(() => LexoBucketRank.between(a, b)).toThrow(/different bucket separators/);
  });

  it("refuses between ranks with different bucket lists (structural)", () => {
    const a = new LexoBucketRank("0", "m", { buckets: ["0", "1", "2"] });
    const b = new LexoBucketRank("0", "m", { buckets: ["0", "1"] });
    expect(() => LexoBucketRank.between(a, b)).toThrow(/different bucket lists/);
  });

  it("accepts between ranks built with separate but equivalent bucket list instances", () => {
    const a = new LexoBucketRank("0", "5", { buckets: ["0", "1", "2"] });
    const b = new LexoBucketRank("0", "m", { buckets: ["0", "1", "2"] });
    expect(() => LexoBucketRank.between(a, b)).not.toThrow();
  });

  it("refuses between ranks with different alphabets", () => {
    const a = new LexoBucketRank("0", "5", { alphabet: NUMERIC });
    const b = new LexoBucketRank("0", "a", { alphabet: LOWER_ALPHA });
    expect(() => LexoBucketRank.between(a, b)).toThrow(/different alphabets/);
  });

  it("refuses between across buckets", () => {
    const a = LexoBucketRank.parse("0|m");
    const b = LexoBucketRank.parse("1|m");
    expect(() => LexoBucketRank.between(a, b)).toThrow(/different buckets/);
  });

  it("inBucket moves to any named bucket", () => {
    const r = LexoBucketRank.middle();
    expect(r.inBucket("1").bucket).toBe("1");
    expect(r.inBucket("2").bucket).toBe("2");
    expect(r.inBucket("0").equals(r)).toBe(true);
  });

  it("inBucket preserves the value", () => {
    const r = LexoBucketRank.middle();
    expect(r.inBucket("1").value).toBe(r.value);
  });

  it("supports custom alphabets and buckets", () => {
    const config = {
      alphabet: LOWER_ALPHA,
      buckets: ["x", "y", "z"] as const,
      bucketSeparator: ":"
    };
    const r = LexoBucketRank.middle(config);
    expect(r.toString()).toBe("x:n");
    expect(r.inBucket("y").toString()).toBe("y:n");
    const parsed = LexoBucketRank.parse("z:abc", config);
    expect(parsed.bucket).toBe("z");
    expect(parsed.value).toBe("abc");
  });

  it("getBucket returns the bucket string", () => {
    const r = LexoBucketRank.middle();
    expect(r.getBucket()).toBe(r.bucket);
  });

  it("between instance method delegates to the static", () => {
    const a = LexoBucketRank.min();
    const b = LexoBucketRank.max();
    expect(a.between(b).value).toBe(LexoBucketRank.between(a, b).value);
  });

  it("compareTo returns 0 for equal ranks", () => {
    const a = LexoBucketRank.middle();
    const b = LexoBucketRank.middle();
    expect(a.compareTo(b)).toBe(0);
  });

  it("compareTo returns 1 when left > right within the same bucket", () => {
    const a = LexoBucketRank.parse("0|z");
    const b = LexoBucketRank.parse("0|a");
    expect(a.compareTo(b)).toBe(1);
  });

  it("compareTo orders across buckets by bucket first", () => {
    const a = LexoBucketRank.parse("0|z");
    const b = LexoBucketRank.parse("1|a");
    expect(a.compareTo(b)).toBe(-1);
  });

  it("genNext / genPrev keep the bucket", () => {
    const r = LexoBucketRank.middle().inBucket("1");
    expect(r.genNext().bucket).toBe(r.bucket);
    expect(r.genPrev().bucket).toBe(r.bucket);
    expect(r.compareTo(r.genNext())).toBe(-1);
    expect(r.compareTo(r.genPrev())).toBe(1);
  });
});
