import { describe, it, expect } from "vitest";
import { genBetween, MAX_RANK_LENGTH } from "../src/algorithm/between";
import { BASE36, LOWER_ALPHA, NUMERIC } from "../src/alphabet";

describe("genBetween", () => {
  it("rejects prev >= next", () => {
    expect(() => genBetween("b", "a", BASE36)).toThrow();
    expect(() => genBetween("a", "a", BASE36)).toThrow();
  });

  it("throws on the degenerate next = prev + min-chars case", () => {
    expect(() => genBetween("a", "a0", BASE36)).toThrow(/no rank exists/i);
    expect(() => genBetween("a", "a000", BASE36)).toThrow(/no rank exists/i);
    expect(() => genBetween("", "0", BASE36)).toThrow(/no rank exists/i);
  });

  it("returns a value strictly between prev and next", () => {
    const pairs: [string, string][] = [
      ["a", "z"],
      ["a", "b"],
      ["ab", "ac"],
      ["a", "aa"],
      ["1", "2"],
      ["0", "1"],
      ["a", "azz"],
      ["abc", "abd"],
      ["a0", "a1"],
      ["a", "c"]
    ];
    for (const [a, b] of pairs) {
      const mid = genBetween(a, b, BASE36);
      expect(mid > a, `"${mid}" > "${a}"`).toBe(true);
      expect(mid < b, `"${mid}" < "${b}"`).toBe(true);
    }
  });

  it("preserves order across many repeated insertions between two fixed bounds", () => {
    const lo = "a";
    const hi = "z";
    const ranks = [lo, hi];
    for (let i = 0; i < 500; i++) {
      const insertAt = Math.floor(Math.random() * (ranks.length - 1));
      const before = ranks[insertAt]!;
      const after = ranks[insertAt + 1]!;
      const r = genBetween(before, after, BASE36);
      ranks.splice(insertAt + 1, 0, r);
    }
    const sorted = [...ranks].sort();
    expect(ranks).toEqual(sorted);
    // Sanity: all unique
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("works for always-smaller insertions (front of list)", () => {
    // Simulate "always insert before first item" — the tricky side.
    let lo = "1";
    for (let i = 0; i < 30; i++) {
      const next = genBetween("0", lo, BASE36);
      expect(next > "0").toBe(true);
      expect(next < lo).toBe(true);
      lo = next;
    }
  });

  it("works for always-larger insertions (back of list)", () => {
    let hi = "y";
    for (let i = 0; i < 30; i++) {
      const next = genBetween(hi, "z", BASE36);
      expect(next > hi).toBe(true);
      expect(next < "z").toBe(true);
      hi = next;
    }
  });

  it("respects a custom alphabet", () => {
    const mid = genBetween("a", "z", LOWER_ALPHA);
    LOWER_ALPHA.validate(mid);
    expect(mid > "a" && mid < "z").toBe(true);
  });

  it("rejects chars outside the alphabet", () => {
    expect(() => genBetween("a", "z", NUMERIC)).toThrow(/invalid character/);
  });

  it("keeps results short (no runaway length) for typical pairs", () => {
    const r = genBetween("a", "z", BASE36);
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("rejects inputs longer than MAX_RANK_LENGTH", () => {
    const huge = "a".repeat(MAX_RANK_LENGTH + 1);
    expect(() => genBetween(huge, "z", BASE36)).toThrow(/exceeds maximum/);
    expect(() => genBetween("a", huge, BASE36)).toThrow(/exceeds maximum/);
  });

  it("throws a clear TypeError when prev or next is not a string", () => {
    expect(() => genBetween(null as unknown as string, "z", BASE36)).toThrow(
      /must be a string/
    );
    expect(() => genBetween("a", 123 as unknown as string, BASE36)).toThrow(
      /must be a string/
    );
  });
});
