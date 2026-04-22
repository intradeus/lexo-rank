import { describe, it, expect } from "vitest";
import {
  DEFAULT_INTEGER_WIDTH,
  DEFAULT_DECIMAL_SEPARATOR,
  LexoDecimalRank
} from "../src/ranks/lexo-decimal-rank";
import { BASE36, LOWER_ALPHA, NUMERIC } from "../src/alphabet";

describe("LexoDecimalRank — integerWidth validation", () => {
  it("throws a clear error when static min/max/middle receive integerWidth <= 0", () => {
    // These previously produced an obscure RangeError from `repeat(-1)` because
    // the static factories computed `width - 1` before constructing.
    expect(() => LexoDecimalRank.min({ integerWidth: 0 })).toThrow(/at least 1/);
    expect(() => LexoDecimalRank.max({ integerWidth: -5 })).toThrow(/at least 1/);
    expect(() => LexoDecimalRank.middle({ integerWidth: 0 })).toThrow(/at least 1/);
  });

  it("rejects NaN integerWidth", () => {
    expect(() => LexoDecimalRank.middle({ integerWidth: NaN })).toThrow(/finite number/);
    expect(() => new LexoDecimalRank("a", "", { integerWidth: NaN })).toThrow(
      /finite number/
    );
  });

  it("rejects Infinity integerWidth", () => {
    expect(() => LexoDecimalRank.middle({ integerWidth: Infinity })).toThrow(
      /finite number/
    );
  });

  it("rejects fractional integerWidth", () => {
    expect(() => LexoDecimalRank.middle({ integerWidth: 1.5 })).toThrow(
      /must be an integer/
    );
  });

  it("rejects absurdly large integerWidth", () => {
    expect(() => LexoDecimalRank.middle({ integerWidth: 1e9 })).toThrow(
      /exceeds the maximum/
    );
  });
});

describe("LexoDecimalRank — fixed-width defaults", () => {
  it("pads integers to the default width (6) with the alphabet min char", () => {
    const r = LexoDecimalRank.middle();
    expect(r.integer).toBe("i00000");
    expect(r.decimal).toBe("");
    expect(r.integerWidth).toBe(DEFAULT_INTEGER_WIDTH);
    expect(r.toString()).toBe("i00000:");
    expect(r.decimalSeparator).toBe(DEFAULT_DECIMAL_SEPARATOR);
  });

  it('uses ":" as the default separator (Jira-compatible)', () => {
    expect(DEFAULT_DECIMAL_SEPARATOR).toBe(":");
  });

  it("min / max / middle sit in ascending order", () => {
    const lo = LexoDecimalRank.min();
    const hi = LexoDecimalRank.max();
    const mid = LexoDecimalRank.middle();
    expect(lo.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(hi)).toBe(-1);
  });

  it("rejects integers longer than the configured width", () => {
    expect(() => new LexoDecimalRank("abcdefg", "", { integerWidth: 6 })).toThrow(
      /exceeds configured width/
    );
  });

  it("rejects separators that appear in the alphabet", () => {
    expect(() => new LexoDecimalRank("a", "", { decimalSeparator: "a" })).toThrow(
      /not be part of the alphabet/
    );
  });
});

describe("LexoDecimalRank — insertion behavior", () => {
  it("prefers an integer midpoint when one exists", () => {
    const a = new LexoDecimalRank("c", "");
    const b = new LexoDecimalRank("m", "");
    const mid = LexoDecimalRank.between(a, b);
    expect(mid.decimal).toBe("");
    expect(mid.integer > a.integer && mid.integer < b.integer).toBe(true);
  });

  it("keeps the integer and grows a decimal when integers are adjacent at the fixed width", () => {
    // At width 1, 'y' and 'z' are adjacent with no integer midpoint.
    const config = { integerWidth: 1 };
    const a = new LexoDecimalRank("y", "", config);
    const b = new LexoDecimalRank("z", "", config);
    const mid = LexoDecimalRank.between(a, b);
    expect(mid.integer).toBe("y");
    expect(mid.decimal.length).toBeGreaterThan(0);
    expect(a.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(b)).toBe(-1);
  });

  it("uses (hi.integer, empty) when hi has a non-empty decimal and integers are adjacent", () => {
    const config = { integerWidth: 1 };
    const a = new LexoDecimalRank("y", "q", config);
    const b = new LexoDecimalRank("z", "a", config);
    const mid = LexoDecimalRank.between(a, b);
    expect(mid.integer).toBe("z");
    expect(mid.decimal).toBe("");
  });

  it("splits between decimals when integers match", () => {
    const a = new LexoDecimalRank("m", "a");
    const b = new LexoDecimalRank("m", "z");
    const mid = LexoDecimalRank.between(a, b);
    expect(mid.integer).toBe(a.integer);
    expect(mid.decimal > "a" && mid.decimal < "z").toBe(true);
  });

  it("(int, empty) < (int, any non-empty)", () => {
    const a = new LexoDecimalRank("m", "");
    const b = new LexoDecimalRank("m", "a");
    expect(a.compareTo(b)).toBe(-1);
  });
});

describe("LexoDecimalRank — parsing and rendering", () => {
  it("round-trips parse <-> toString (empty decimal)", () => {
    const r = LexoDecimalRank.middle();
    const parsed = LexoDecimalRank.parse(r.toString());
    expect(parsed.equals(r)).toBe(true);
  });

  it("round-trips parse <-> toString (non-empty decimal)", () => {
    const r = new LexoDecimalRank("hzzz", "abc");
    const parsed = LexoDecimalRank.parse(r.toString());
    expect(parsed.equals(r)).toBe(true);
  });

  it("throws when parsing a string without the separator", () => {
    expect(() => LexoDecimalRank.parse("no-separator")).toThrow(/missing decimal/);
  });

  it("rendered strings sort identically to compareTo (default config)", () => {
    const ranks = [
      new LexoDecimalRank("a", ""),
      new LexoDecimalRank("a", "a"),
      new LexoDecimalRank("a", "z"),
      new LexoDecimalRank("aa", ""),
      new LexoDecimalRank("b", ""),
      new LexoDecimalRank("z", "m")
    ];
    const byCompare = [...ranks].sort((x, y) => x.compareTo(y));
    const byString = [...ranks].sort((x, y) =>
      x.toString() < y.toString() ? -1 : x.toString() > y.toString() ? 1 : 0
    );
    expect(byString.map((r) => r.toString())).toEqual(byCompare.map((r) => r.toString()));
  });
});

describe("LexoDecimalRank — gen and alphabet handling", () => {
  it("genNext / genPrev stay in bounds", () => {
    const r = LexoDecimalRank.middle();
    expect(r.compareTo(r.genNext())).toBe(-1);
    expect(r.compareTo(r.genPrev())).toBe(1);
  });

  it("genPrev throws at the absolute minimum", () => {
    const r = new LexoDecimalRank(BASE36.charAt(0).repeat(6), "");
    expect(() => r.genPrev()).toThrow(/absolute minimum/);
  });

  it("supports custom alphabets", () => {
    const r = LexoDecimalRank.middle({ alphabet: LOWER_ALPHA });
    expect(r.integer[0]).toBe("n");
    expect(r.toString().startsWith("n")).toBe(true);
  });

  it("refuses between on mismatched alphabets", () => {
    const a = new LexoDecimalRank("a", "", { alphabet: LOWER_ALPHA });
    const b = new LexoDecimalRank("5", "", { alphabet: NUMERIC });
    expect(() => LexoDecimalRank.between(a, b)).toThrow(/different alphabets/);
  });

  it("refuses between on mismatched integer widths", () => {
    const a = new LexoDecimalRank("a", "", { integerWidth: 4 });
    const b = new LexoDecimalRank("b", "", { integerWidth: 6 });
    expect(() => LexoDecimalRank.between(a, b)).toThrow(/different integer widths/);
  });

  it("refuses between on mismatched decimal separators", () => {
    const a = new LexoDecimalRank("a", "", { decimalSeparator: ":" });
    const b = new LexoDecimalRank("b", "", { decimalSeparator: "#" });
    expect(() => LexoDecimalRank.between(a, b)).toThrow(/different decimal separators/);
  });

  it("compareTo returns 0 for equal ranks", () => {
    const r = LexoDecimalRank.middle();
    expect(r.compareTo(r)).toBe(0);
  });

  it("compareTo returns 1 when left > right", () => {
    const a = new LexoDecimalRank("z", "");
    const b = new LexoDecimalRank("a", "");
    expect(a.compareTo(b)).toBe(1);
  });

  it("between instance method delegates to the static", () => {
    const a = LexoDecimalRank.min();
    const b = LexoDecimalRank.max();
    expect(a.between(b).equals(LexoDecimalRank.between(a, b))).toBe(true);
  });

  it("between is order-insensitive when caller passes hi before lo", () => {
    const lo = new LexoDecimalRank("c", "");
    const hi = new LexoDecimalRank("m", "");
    // Static between should produce the same result regardless of argument order.
    expect(LexoDecimalRank.between(lo, hi).equals(LexoDecimalRank.between(hi, lo))).toBe(
      true
    );
  });

  it("rejects multi-character decimal separators", () => {
    expect(() => new LexoDecimalRank("a", "", { decimalSeparator: "::" })).toThrow(
      /single character/
    );
  });
});

describe("LexoDecimalRank — dense insertion at narrow integer width", () => {
  it("falls back to decimal growth and maintains order for many inserts", () => {
    const config = { integerWidth: 2 };
    const ranks = [LexoDecimalRank.min(config), LexoDecimalRank.max(config)];
    for (let i = 0; i < 300; i++) {
      const at = Math.floor(Math.random() * (ranks.length - 1));
      const mid = LexoDecimalRank.between(ranks[at]!, ranks[at + 1]!);
      ranks.splice(at + 1, 0, mid);
    }
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]!.compareTo(ranks[i]!)).toBe(-1);
    }
  });
});
