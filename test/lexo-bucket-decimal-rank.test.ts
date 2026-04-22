import { describe, it, expect } from "vitest";
import { LexoBucketDecimalRank } from "../src/ranks/lexo-bucket-decimal-rank";
import { LOWER_ALPHA, NUMERIC } from "../src/alphabet";

describe("LexoBucketDecimalRank — integerWidth validation", () => {
  it("throws clear errors for invalid integerWidth via static factories", () => {
    expect(() => LexoBucketDecimalRank.min({ integerWidth: 0 })).toThrow(/at least 1/);
    expect(() => LexoBucketDecimalRank.max({ integerWidth: NaN })).toThrow(
      /finite number/
    );
    expect(() => LexoBucketDecimalRank.middle({ integerWidth: 1.5 })).toThrow(
      /must be an integer/
    );
    expect(() => LexoBucketDecimalRank.middle({ integerWidth: 1e9 })).toThrow(
      /exceeds the maximum/
    );
  });
});

describe("LexoBucketDecimalRank", () => {
  it("formats as bucket|integer:decimal (Jira-style)", () => {
    const r = LexoBucketDecimalRank.middle();
    expect(r.toString()).toBe("0|i00000:");
    expect(r.bucket).toBe("0");
    expect(r.integer).toBe("i00000");
    expect(r.decimal).toBe("");
  });

  it("round-trips parse <-> toString", () => {
    const r = new LexoBucketDecimalRank("1", "hzzz", "abc");
    const parsed = LexoBucketDecimalRank.parse(r.toString());
    expect(parsed.equals(r)).toBe(true);
  });

  it("rejects parses missing the bucket separator", () => {
    expect(() => LexoBucketDecimalRank.parse("hzzz:abc")).toThrow(/bucket separator/);
  });

  it("rejects parses missing the decimal separator", () => {
    expect(() => LexoBucketDecimalRank.parse("0|hzzz")).toThrow(/decimal separator/);
  });

  it("produces between-ranks within the same bucket", () => {
    const lo = LexoBucketDecimalRank.min();
    const hi = LexoBucketDecimalRank.max();
    const mid = LexoBucketDecimalRank.between(lo, hi);
    expect(mid.bucket).toBe("0");
    expect(lo.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(hi)).toBe(-1);
  });

  it("refuses between across buckets", () => {
    const a = LexoBucketDecimalRank.middle();
    const b = LexoBucketDecimalRank.middle().inBucket("1");
    expect(() => LexoBucketDecimalRank.between(a, b)).toThrow(/different buckets/);
  });

  it("inBucket preserves integer and decimal", () => {
    const r = new LexoBucketDecimalRank("0", "hzzz", "abc");
    const next = r.inBucket("1");
    expect(next.bucket).toBe("1");
    expect(next.integer).toBe("hzzz00");
    expect(next.decimal).toBe("abc");
  });

  it("genNext keeps the bucket", () => {
    const r = LexoBucketDecimalRank.middle().inBucket("1");
    const next = r.genNext();
    expect(next.bucket).toBe(r.bucket);
    expect(r.compareTo(next)).toBe(-1);
  });

  it("renders with custom separators, bucket list, and integer width", () => {
    const config = {
      alphabet: LOWER_ALPHA,
      buckets: ["X", "Y", "Z"] as const,
      bucketSeparator: "~",
      decimalSeparator: "-",
      integerWidth: 3
    };
    const r = LexoBucketDecimalRank.middle(config);
    expect(r.toString()).toBe("X~naa-");
    const parsed = LexoBucketDecimalRank.parse("Z~abc-xyz", config);
    expect(parsed.bucket).toBe("Z");
    expect(parsed.integer).toBe("abc");
    expect(parsed.decimal).toBe("xyz");
  });

  it("getBucket returns the bucket string", () => {
    const r = LexoBucketDecimalRank.middle();
    expect(r.getBucket()).toBe(r.bucket);
  });

  it("inBucket is reversible by moving back to the original bucket", () => {
    const r = LexoBucketDecimalRank.middle();
    expect(r.inBucket("2").inBucket(r.bucket).equals(r)).toBe(true);
  });

  it("between instance method delegates to the static", () => {
    const a = LexoBucketDecimalRank.min();
    const b = LexoBucketDecimalRank.max();
    expect(a.between(b).equals(LexoBucketDecimalRank.between(a, b))).toBe(true);
  });

  it("genPrev throws at the absolute minimum in its bucket", () => {
    const width = 6;
    const absMinInt = "0".repeat(width);
    const r = new LexoBucketDecimalRank("0", absMinInt, "", {
      integerWidth: width
    });
    expect(() => r.genPrev()).toThrow(/absolute minimum/);
  });

  it("genPrev returns a strictly smaller rank for a non-minimum rank", () => {
    const r = LexoBucketDecimalRank.middle();
    const prev = r.genPrev();
    expect(prev.compareTo(r)).toBe(-1);
    expect(prev.bucket).toBe(r.bucket);
  });

  it("between is order-insensitive when caller passes hi before lo", () => {
    const lo = LexoBucketDecimalRank.min();
    const hi = LexoBucketDecimalRank.max();
    expect(
      LexoBucketDecimalRank.between(lo, hi).equals(LexoBucketDecimalRank.between(hi, lo))
    ).toBe(true);
  });

  it("refuses between ranks with different alphabets", () => {
    const a = new LexoBucketDecimalRank("0", "5", "", { alphabet: NUMERIC });
    const b = new LexoBucketDecimalRank("0", "a", "", { alphabet: LOWER_ALPHA });
    expect(() => LexoBucketDecimalRank.between(a, b)).toThrow(/different alphabets/);
  });

  it("refuses between ranks with different decimal separators", () => {
    const a = new LexoBucketDecimalRank("0", "5", "", { decimalSeparator: ":" });
    const b = new LexoBucketDecimalRank("0", "5", "", { decimalSeparator: "#" });
    expect(() => LexoBucketDecimalRank.between(a, b)).toThrow(
      /different decimal separators/
    );
  });

  it("refuses between ranks with different integer widths", () => {
    const a = new LexoBucketDecimalRank("0", "5", "", { integerWidth: 4 });
    const b = new LexoBucketDecimalRank("0", "5", "", { integerWidth: 6 });
    expect(() => LexoBucketDecimalRank.between(a, b)).toThrow(/different integer widths/);
  });

  it("compareTo returns 0 for equal ranks", () => {
    const r = LexoBucketDecimalRank.middle();
    expect(r.compareTo(r)).toBe(0);
  });

  it("compareTo flips sign when the caller is in the later bucket", () => {
    const a = LexoBucketDecimalRank.middle().inBucket("1");
    const b = LexoBucketDecimalRank.middle();
    expect(a.compareTo(b)).toBe(1);
  });

  it("equals returns false across different integer widths", () => {
    const a = LexoBucketDecimalRank.middle({ integerWidth: 4 });
    const b = LexoBucketDecimalRank.middle({ integerWidth: 6 });
    expect(a.equals(b)).toBe(false);
  });

  it("compareTo uses bucket order first", () => {
    const a = LexoBucketDecimalRank.parse("0|z:");
    const b = LexoBucketDecimalRank.parse("1|a:");
    expect(a.compareTo(b)).toBe(-1);
  });

  it("rendered strings sort the same as compareTo within a bucket", () => {
    const ranks = [
      new LexoBucketDecimalRank("0", "a", ""),
      new LexoBucketDecimalRank("0", "a", "a"),
      new LexoBucketDecimalRank("0", "a", "z"),
      new LexoBucketDecimalRank("0", "aa", ""),
      new LexoBucketDecimalRank("0", "b", "")
    ];
    const byCompare = [...ranks].sort((x, y) => x.compareTo(y));
    const byString = [...ranks].sort((x, y) =>
      x.toString() < y.toString() ? -1 : x.toString() > y.toString() ? 1 : 0
    );
    expect(byString.map((r) => r.toString())).toEqual(byCompare.map((r) => r.toString()));
  });
});
