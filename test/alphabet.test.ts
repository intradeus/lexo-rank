import { describe, it, expect } from "vitest";
import {
  alphabetFromRange,
  alphabetFromSamples,
  BASE36,
  BASE62,
  LOWER_ALPHA,
  NUMERIC,
  StringAlphabet
} from "../src/alphabet";

describe("StringAlphabet", () => {
  it("rejects alphabets shorter than 4", () => {
    expect(() => new StringAlphabet("abc")).toThrow(/at least 4/);
  });

  it("rejects non-ascending characters", () => {
    expect(() => new StringAlphabet("abdc")).toThrow(/ascending/);
  });

  it("rejects duplicate characters", () => {
    expect(() => new StringAlphabet("abca")).toThrow(/ascending|duplicate/);
  });

  it("indexes and char-looks-up round-trip", () => {
    expect(BASE36.indexOf("0")).toBe(0);
    expect(BASE36.indexOf("z")).toBe(35);
    expect(BASE36.charAt(18)).toBe("i");
  });

  it("validates raw rank strings", () => {
    expect(() => BASE36.validate("abc")).not.toThrow();
    expect(() => BASE36.validate("AB")).toThrow(/invalid character/);
  });

  it("rejects alphabets containing non-BMP characters (surrogate pairs)", () => {
    // Emoji like '🅰' are encoded as a surrogate pair in UTF-16; they would
    // split across two index positions and produce unpaired surrogates at
    // charAt().
    expect(() => new StringAlphabet("🅰🅱🅲🅳")).toThrow(/BMP characters/);
  });

  it("accepts all-BMP alphabets including non-ASCII BMP chars", () => {
    // Greek letters are BMP (single code units). Ascending by code point.
    expect(() => new StringAlphabet("αβγδ")).not.toThrow();
  });
});

describe("presets", () => {
  it("have the expected sizes", () => {
    expect(NUMERIC.size).toBe(10);
    expect(LOWER_ALPHA.size).toBe(26);
    expect(BASE36.size).toBe(36);
    expect(BASE62.size).toBe(62);
  });
});

describe("alphabetFromRange", () => {
  it("expands numeric ranges", () => {
    const a = alphabetFromRange("0-9");
    expect(a.chars).toBe("0123456789");
  });

  it("expands combined ranges", () => {
    const a = alphabetFromRange("0-9a-z");
    expect(a.chars).toBe("0123456789abcdefghijklmnopqrstuvwxyz");
  });

  it("supports standalone characters mixed with ranges", () => {
    const a = alphabetFromRange("a-c!xyz");
    expect(a.chars).toBe("!abcxyz");
  });

  it("deduplicates overlapping ranges", () => {
    const a = alphabetFromRange("a-ea-e");
    expect(a.chars).toBe("abcde");
  });

  it("throws when the deduplicated range is too small", () => {
    expect(() => alphabetFromRange("a-ca-c")).toThrow(/at least 4/);
  });

  it("rejects reversed ranges", () => {
    expect(() => alphabetFromRange("z-a")).toThrow(/end before start/);
  });

  it("rejects specs ending with a trailing dash (incomplete range)", () => {
    expect(() => alphabetFromRange("0-9a-")).toThrow(/no end character/);
    expect(() => alphabetFromRange("abc-")).toThrow(/no end character/);
  });
});

describe("alphabetFromSamples", () => {
  it("builds the minimum covering alphabet", () => {
    const a = alphabetFromSamples(["abc", "xyz", "mno"]);
    expect(a.chars).toBe("abcmnoxyz");
  });

  it("throws when samples provide fewer than 4 unique chars", () => {
    expect(() => alphabetFromSamples(["aa", "bb"])).toThrow(/at least 4/);
  });
});
