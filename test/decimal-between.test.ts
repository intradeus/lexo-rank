import { describe, it, expect } from "vitest";
import { decimalBetween, decimalLess } from "../src/algorithm/decimal-between";
import { BASE36, LOWER_ALPHA } from "../src/alphabet";

describe("decimalLess", () => {
  it("returns true when integers differ and aInt < bInt", () => {
    expect(decimalLess("a", "x", "b", "")).toBe(true);
    expect(decimalLess("a", "zzz", "aa", "")).toBe(true);
  });

  it("returns false when integers differ and aInt > bInt", () => {
    expect(decimalLess("b", "", "a", "z")).toBe(false);
  });

  it("treats empty decimal as smaller than any non-empty decimal (same integer)", () => {
    expect(decimalLess("abc", "", "abc", "a")).toBe(true);
    expect(decimalLess("abc", "a", "abc", "")).toBe(false);
  });

  it("compares decimals lexicographically when integers match", () => {
    expect(decimalLess("abc", "a", "abc", "b")).toBe(true);
    expect(decimalLess("abc", "b", "abc", "a")).toBe(false);
  });

  it("returns false when tuples are equal", () => {
    expect(decimalLess("abc", "xyz", "abc", "xyz")).toBe(false);
    expect(decimalLess("abc", "", "abc", "")).toBe(false);
  });
});

describe("decimalBetween — same integer", () => {
  it("produces a decimal strictly between the two decimals", () => {
    const r = decimalBetween("abc", "a", "abc", "z", BASE36, 6);
    expect(r.integer).toBe("abc");
    expect(r.decimal > "a" && r.decimal < "z").toBe(true);
  });

  it("produces a non-empty decimal when lo.decimal is empty", () => {
    const r = decimalBetween("abc", "", "abc", "z", BASE36, 6);
    expect(r.integer).toBe("abc");
    expect(r.decimal.length).toBeGreaterThan(0);
    expect(r.decimal < "z").toBe(true);
  });

  it("throws when the two tuples are identical", () => {
    expect(() => decimalBetween("abc", "xy", "abc", "xy", BASE36, 6)).toThrow(
      /equal ranks/
    );
  });
});

describe("decimalBetween — distinct integers with room to split", () => {
  it("returns an integer midpoint with an empty decimal", () => {
    const r = decimalBetween("c", "", "m", "", BASE36, 1);
    expect(r.decimal).toBe("");
    expect(r.integer > "c" && r.integer < "m").toBe(true);
  });

  it("still prefers the integer midpoint even when inputs carry decimals", () => {
    const r = decimalBetween("c", "xxx", "m", "yyy", BASE36, 1);
    expect(r.decimal).toBe("");
    expect(r.integer > "c" && r.integer < "m").toBe(true);
  });
});

describe("decimalBetween — adjacent integers (no room to split)", () => {
  it("picks (hi.integer, empty) when hi.decimal is non-empty (cheapest path)", () => {
    // At width 1, 'y' and 'z' are adjacent in the integer space.
    const r = decimalBetween("y", "q", "z", "a", BASE36, 1);
    expect(r.integer).toBe("z");
    expect(r.decimal).toBe("");
  });

  it("falls back to growing lo.decimal when hi.decimal is empty", () => {
    const r = decimalBetween("y", "", "z", "", BASE36, 1);
    expect(r.integer).toBe("y");
    expect(r.decimal.length).toBeGreaterThan(0);
    // The extended decimal must be > lo.decimal='' → any non-empty works.
    expect(r.decimal).toBe(BASE36.charAt(BASE36.size >> 1));
  });

  it("extends an existing lo.decimal by appending a mid-alphabet char", () => {
    const r = decimalBetween("y", "abc", "z", "", BASE36, 1);
    expect(r.integer).toBe("y");
    expect(r.decimal.startsWith("abc")).toBe(true);
    expect(r.decimal.length).toBeGreaterThan("abc".length);
  });
});

describe("decimalBetween — error passthrough", () => {
  it("re-throws non-NoBoundedMidpointError errors from genBetweenBounded", () => {
    // Width 0 triggers a different error ("width must be at least 1"), which
    // decimalBetween must not mistake for an adjacent-integer fallback signal.
    expect(() => decimalBetween("a", "", "b", "", BASE36, 0)).toThrow(
      /width must be at least 1/
    );
  });
});

describe("decimalBetween — custom alphabet", () => {
  it("uses the provided alphabet", () => {
    const r = decimalBetween("a", "", "z", "", LOWER_ALPHA, 1);
    LOWER_ALPHA.validate(r.integer);
    LOWER_ALPHA.validate(r.decimal);
    expect(r.integer > "a" && r.integer < "z").toBe(true);
  });
});

describe("decimalBetween — correctness under repeated use", () => {
  it("maintains strict ordering through many narrow-width inserts", () => {
    // Narrow width forces decimal fallback frequently — exercises both
    // branches of the algorithm heavily.
    const width = 1;
    interface Tuple {
      int: string;
      dec: string;
    }
    const ranks: Tuple[] = [
      { int: BASE36.charAt(1), dec: "" },
      { int: BASE36.charAt(BASE36.size - 2), dec: "" }
    ];
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(Math.random() * (ranks.length - 1));
      const lo = ranks[at]!;
      const hi = ranks[at + 1]!;
      const mid = decimalBetween(lo.int, lo.dec, hi.int, hi.dec, BASE36, width);
      ranks.splice(at + 1, 0, { int: mid.integer, dec: mid.decimal });
    }
    for (let i = 1; i < ranks.length; i++) {
      const prev = ranks[i - 1]!;
      const curr = ranks[i]!;
      expect(decimalLess(prev.int, prev.dec, curr.int, curr.dec)).toBe(true);
    }
  });
});
