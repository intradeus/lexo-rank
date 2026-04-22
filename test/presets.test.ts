import { describe, it, expect } from "vitest";
import {
  BASE36,
  BASE62,
  LOWER_ALPHA,
  NUMERIC,
  UPPER_ALPHA,
  type Alphabet
} from "../src/alphabet";
import { genBetween } from "../src/algorithm/between";
import { LexoRank } from "../src/ranks/lexo-rank";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";
import { createLexoRank } from "../src/factory";

const PRESETS: readonly (readonly [string, Alphabet])[] = [
  ["NUMERIC", NUMERIC],
  ["LOWER_ALPHA", LOWER_ALPHA],
  ["UPPER_ALPHA", UPPER_ALPHA],
  ["BASE36", BASE36],
  ["BASE62", BASE62]
];

describe.each(PRESETS)("preset %s", (_name, alphabet) => {
  const absMin = alphabet.charAt(0);
  const absMax = alphabet.charAt(alphabet.size - 1);
  const safeMin = alphabet.charAt(1);
  const safeMax = alphabet.charAt(alphabet.size - 2);
  const mid = alphabet.charAt(alphabet.size >> 1);

  it("has strictly ascending characters", () => {
    for (let i = 1; i < alphabet.size; i++) {
      expect(alphabet.charAt(i - 1) < alphabet.charAt(i)).toBe(true);
    }
  });

  it("indexOf / charAt round-trip", () => {
    for (let i = 0; i < alphabet.size; i++) {
      expect(alphabet.indexOf(alphabet.charAt(i))).toBe(i);
    }
  });

  it("genBetween on absolute bounds produces a valid rank", () => {
    const r = genBetween(absMin, absMax, alphabet);
    alphabet.validate(r);
    expect(r > absMin && r < absMax).toBe(true);
  });

  it("genBetween on adjacent characters extends the rank", () => {
    // Any two adjacent characters force the algorithm to extend precision.
    const a = alphabet.charAt(0);
    const b = alphabet.charAt(1);
    const r = genBetween(a, b, alphabet);
    alphabet.validate(r);
    expect(r > a && r < b).toBe(true);
    expect(r.length).toBeGreaterThan(1);
  });

  it("rejects the degenerate next = prev + min-chars case", () => {
    expect(() => genBetween(safeMin, safeMin + absMin, alphabet)).toThrow(
      /no rank exists/i
    );
  });

  it("LexoRank.min / max / middle are well-formed and ordered", () => {
    const lo = LexoRank.min(alphabet);
    const hi = LexoRank.max(alphabet);
    const m = LexoRank.middle(alphabet);
    expect(lo.value).toBe(safeMin);
    expect(hi.value).toBe(safeMax);
    expect(m.value).toBe(mid);
    expect(lo.compareTo(m)).toBe(-1);
    expect(m.compareTo(hi)).toBe(-1);
  });

  it("LexoRank supports many random insertions while preserving order", () => {
    const ranks = [LexoRank.min(alphabet), LexoRank.max(alphabet)];
    for (let i = 0; i < 200; i++) {
      const at = Math.floor(Math.random() * (ranks.length - 1));
      const inserted = LexoRank.between(ranks[at]!, ranks[at + 1]!);
      ranks.splice(at + 1, 0, inserted);
    }
    const values = ranks.map((r) => r.value);
    expect(values).toEqual([...values].sort());
    expect(new Set(values).size).toBe(values.length);
  });

  it("LexoRank.genNext / genPrev stay in bounds and keep going", () => {
    let cur = LexoRank.middle(alphabet);
    for (let i = 0; i < 50; i++) {
      const next = cur.genNext();
      expect(cur.compareTo(next)).toBe(-1);
      cur = next;
    }
    cur = LexoRank.middle(alphabet);
    for (let i = 0; i < 50; i++) {
      const prev = cur.genPrev();
      expect(cur.compareTo(prev)).toBe(1);
      cur = prev;
    }
  });

  it("LexoBucketRank works with this alphabet", () => {
    const lo = LexoBucketRank.min({ alphabet });
    const hi = LexoBucketRank.max({ alphabet });
    const m = LexoBucketRank.between(lo, hi);
    expect(lo.compareTo(m)).toBe(-1);
    expect(m.compareTo(hi)).toBe(-1);
    expect(m.bucket).toBe("0");
  });

  it("createLexoRank (simple) round-trips parse <-> toString", () => {
    const R = createLexoRank({ alphabet });
    const m = R.middle();
    expect(R.parse(m.value).equals(m)).toBe(true);
  });

  it("createLexoRank (bucket) round-trips parse <-> toString", () => {
    const R = createLexoRank({ bucket: true, alphabet });
    const m = R.middle();
    expect(R.parse(m.toString()).equals(m)).toBe(true);
  });

  it("createLexoRank (decimal) round-trips parse <-> toString", () => {
    const R = createLexoRank({ decimal: true, alphabet });
    const m = R.middle();
    expect(R.parse(m.toString()).equals(m)).toBe(true);
  });

  it("createLexoRank (bucket + decimal) round-trips parse <-> toString", () => {
    const R = createLexoRank({ bucket: true, decimal: true, alphabet });
    const m = R.middle();
    expect(R.parse(m.toString()).equals(m)).toBe(true);
  });
});
