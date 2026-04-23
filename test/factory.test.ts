import { describe, it, expect } from "vitest";
import { createLexoRank, rankBetween } from "../src/factory";
import { BASE62, NUMERIC } from "../src/alphabet";
import { LexoRank } from "../src/ranks/lexo-rank";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";

describe("createLexoRank — simple mode", () => {
  it("defaults to base36 simple mode", () => {
    const R = createLexoRank();
    expect(R.bucket).toBe(false);
    expect(R.decimal).toBe(false);
    expect(R.alphabet.size).toBe(36);
    expect(R.min()).toBeInstanceOf(LexoRank);
    expect(R.middle().value).toBe("i");
  });

  it("uses a provided alphabet instance", () => {
    const R = createLexoRank({ alphabet: BASE62 });
    expect(R.alphabet).toBe(BASE62);
    expect(R.middle().value).toBe(BASE62.charAt(31));
  });

  it("accepts a character range spec", () => {
    const R = createLexoRank({ range: "0-9" });
    expect(R.alphabet.chars).toBe("0123456789");
    expect(R.middle().value).toBe("5");
  });

  it("infers an alphabet from sample ranks", () => {
    const R = createLexoRank({ samples: ["abc", "xyz", "mno"] });
    expect(R.alphabet.chars).toBe("abcmnoxyz");
    const m = R.rankBetween(R.from("a"), R.from("z"));
    expect(m.value > "a" && m.value < "z").toBe(true);
  });

  it("parse and from are interchangeable", () => {
    const R = createLexoRank({ range: "0-9" });
    expect(R.parse("5").value).toBe(R.from("5").value);
  });
});

describe("createLexoRank — bucket mode", () => {
  it("returns bucket-aware instances", () => {
    const R = createLexoRank({ bucket: true });
    const m = R.middle();
    expect(m).toBeInstanceOf(LexoBucketRank);
    expect(m.toString()).toBe("0|i");
  });

  it("respects custom bucket config", () => {
    const R = createLexoRank({
      bucket: true,
      alphabet: NUMERIC,
      buckets: ["A", "B"],
      bucketSeparator: "#"
    });
    const m = R.middle();
    expect(m.toString()).toBe("A#5");
    expect(m.inBucket("B").toString()).toBe("B#5");
  });

  it("produces ranks between via factory", () => {
    const R = createLexoRank({ bucket: true });
    const a = R.min();
    const b = R.max();
    const mid = R.rankBetween(a, b);
    expect(a.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(b)).toBe(-1);
  });
});

describe("createLexoRank — every mode exercises min/max/middle/between/parse/from", () => {
  const modes = [
    { name: "simple", mod: createLexoRank() },
    { name: "bucket", mod: createLexoRank({ bucket: true }) },
    { name: "decimal", mod: createLexoRank({ decimal: true }) },
    {
      name: "bucket+decimal",
      mod: createLexoRank({ bucket: true, decimal: true })
    }
  ] as const;

  for (const { name, mod } of modes) {
    it(`${name}`, () => {
      const lo = mod.min();
      const hi = mod.max();
      const mid = mod.middle();
      // Cast around per-mode generic narrowing; runtime types line up.
      const between = mod.rankBetween(lo as never, hi as never);
      const parsed = mod.parse(mid.toString());
      const from = mod.from(mid.toString());

      expect(lo.toString()).not.toBe(hi.toString());
      expect(parsed.toString()).toBe(mid.toString());
      expect(from.toString()).toBe(mid.toString());
      expect(between.toString()).toBeTypeOf("string");
    });
  }
});

describe("createLexoRank — input validation", () => {
  it("rejects truthy-but-not-boolean bucket values", () => {
    // Cast-through-any to bypass the type-level overload narrowing; we're
    // exercising the runtime validation branch.
    expect(() => createLexoRank({ bucket: "yes" } as any)).toThrow(/must be a boolean/);
    expect(() => createLexoRank({ bucket: 1 } as any)).toThrow(/must be a boolean/);
  });

  it("rejects truthy-but-not-boolean decimal values", () => {
    expect(() => createLexoRank({ decimal: "on" } as any)).toThrow(/must be a boolean/);
  });

  it("still accepts explicit false / undefined", () => {
    expect(() => createLexoRank({ bucket: false, decimal: false })).not.toThrow();
    expect(() => createLexoRank({})).not.toThrow();
  });
});

describe("rankBetween", () => {
  it("matches genBetween semantics with a default alphabet", () => {
    const r = rankBetween("a", "z");
    expect(r > "a" && r < "z").toBe(true);
  });

  it("accepts a custom alphabet", () => {
    const r = rankBetween("1", "9", NUMERIC);
    NUMERIC.validate(r);
    expect(r > "1" && r < "9").toBe(true);
  });
});
