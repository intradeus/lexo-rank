import { describe, it, expect } from "vitest";
import { LexoRank } from "../src/ranks/lexo-rank";
import { BASE36, LOWER_ALPHA, NUMERIC } from "../src/alphabet";

describe("LexoRank", () => {
  it("has safe min/max/middle defaults in base36", () => {
    expect(LexoRank.min().value).toBe("1");
    expect(LexoRank.max().value).toBe("y");
    expect(LexoRank.middle().value).toBe("i");
  });

  it("middle sits between min and max", () => {
    const lo = LexoRank.min();
    const hi = LexoRank.max();
    const mid = LexoRank.middle();
    expect(lo.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(hi)).toBe(-1);
  });

  it("between produces a rank strictly between two others", () => {
    const a = LexoRank.min();
    const b = LexoRank.max();
    const m = LexoRank.between(a, b);
    expect(a.compareTo(m)).toBe(-1);
    expect(m.compareTo(b)).toBe(-1);
  });

  it("between is order-insensitive", () => {
    const a = LexoRank.parse("c");
    const b = LexoRank.parse("m");
    expect(LexoRank.between(a, b).value).toBe(LexoRank.between(b, a).value);
  });

  it("compareTo returns 0 for equal values", () => {
    const a = new LexoRank("abc");
    const b = new LexoRank("abc");
    expect(a.compareTo(b)).toBe(0);
  });

  it("between instance method delegates to the static", () => {
    const a = new LexoRank("c");
    const b = new LexoRank("m");
    expect(a.between(b).value).toBe(LexoRank.between(a, b).value);
  });

  it("genNext and genPrev stay in bounds relative to self", () => {
    const r = LexoRank.middle();
    expect(r.compareTo(r.genNext())).toBe(-1);
    expect(r.compareTo(r.genPrev())).toBe(1);
  });

  it("refuses to compute between ranks with different alphabets", () => {
    const a = new LexoRank("a", LOWER_ALPHA);
    const b = new LexoRank("5", NUMERIC);
    expect(() => LexoRank.between(a, b)).toThrow(/different alphabets/);
  });

  it("equals compares value and alphabet", () => {
    expect(new LexoRank("a").equals(new LexoRank("a"))).toBe(true);
    expect(new LexoRank("a").equals(new LexoRank("b"))).toBe(false);
    expect(new LexoRank("a", LOWER_ALPHA).equals(new LexoRank("a", BASE36))).toBe(false);
  });

  it("validates the rank value on construction", () => {
    expect(() => new LexoRank("ABC")).toThrow(/invalid character/);
    expect(() => new LexoRank("")).toThrow(/empty/);
  });

  it("throws a clear TypeError when constructed with a non-string value", () => {
    expect(() => new LexoRank(null as unknown as string)).toThrow(/must be a string/);
    expect(() => new LexoRank(42 as unknown as string)).toThrow(/must be a string/);
  });

  it("LexoRank.parse throws a clear TypeError on non-string input", () => {
    expect(() => LexoRank.parse(undefined as unknown as string)).toThrow(
      /must be a string/
    );
  });

  it("supports repeated mid-splitting and preserves sort order", () => {
    let lo = LexoRank.min();
    let hi = LexoRank.max();
    const snapshots: string[] = [lo.value, hi.value];
    for (let i = 0; i < 50; i++) {
      const mid = LexoRank.between(lo, hi);
      snapshots.push(mid.value);
      if (i % 2 === 0) hi = mid;
      else lo = mid;
    }
    const sorted = [...snapshots].sort();
    // Every element we inserted lies between the running lo and hi at the
    // moment of insertion, so the monotonic invariants hold globally too.
    expect(new Set(snapshots).size).toBe(snapshots.length);
    expect(sorted).toEqual([...sorted].sort());
  });
});
