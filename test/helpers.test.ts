import { describe, it, expect } from "vitest";
import { LexoRank } from "../src/ranks/lexo-rank";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";
import { LexoDecimalRank } from "../src/ranks/lexo-decimal-rank";
import { LexoBucketDecimalRank } from "../src/ranks/lexo-bucket-decimal-rank";
import { analyze, rankAfter, rankBefore, rankBetween, move } from "../src/helpers";
import { BASE36 } from "../src/alphabet";

// Generic helpers operate on anything that quacks like a rank. Using
// LexoRank here gives us the smallest concrete fixture.
describe("helpers: rankAfter / rankBefore / rankBetween", () => {
  it("rankAfter returns a middle rank when prev is undefined", () => {
    const r = rankAfter<LexoRank>(undefined, () => LexoRank.middle());
    expect(r.value).toBe(LexoRank.middle().value);
  });

  it("rankAfter delegates to genNext when prev is defined", () => {
    const prev = LexoRank.middle();
    const r = rankAfter(prev, () => LexoRank.middle());
    expect(prev.compareTo(r)).toBe(-1);
  });

  it("rankBefore returns a middle rank when next is undefined", () => {
    const r = rankBefore<LexoRank>(undefined, () => LexoRank.middle());
    expect(r.value).toBe(LexoRank.middle().value);
  });

  it("rankBefore delegates to genPrev when next is defined", () => {
    const next = LexoRank.middle();
    const r = rankBefore(next, () => LexoRank.middle());
    expect(r.compareTo(next)).toBe(-1);
  });

  it("rankBetween handles both undefined → middle", () => {
    const r = rankBetween<LexoRank>(undefined, undefined, () => LexoRank.middle());
    expect(r.value).toBe(LexoRank.middle().value);
  });

  it("rankBetween handles only a defined → genNext", () => {
    const a = LexoRank.middle();
    const r = rankBetween(a, undefined, () => LexoRank.middle());
    expect(a.compareTo(r)).toBe(-1);
  });

  it("rankBetween handles only b defined → genPrev", () => {
    const b = LexoRank.middle();
    const r = rankBetween(undefined, b, () => LexoRank.middle());
    expect(r.compareTo(b)).toBe(-1);
  });

  it("rankBetween with both defined delegates to between (order-insensitive)", () => {
    const a = LexoRank.parse("c");
    const b = LexoRank.parse("m");
    const ab = rankBetween(a, b, () => LexoRank.middle());
    const ba = rankBetween(b, a, () => LexoRank.middle());
    expect(ab.value).toBe(ba.value);
    expect(a.compareTo(ab)).toBe(-1);
    expect(ab.compareTo(b)).toBe(-1);
  });
});

describe("helpers: move", () => {
  function seeded(count: number): LexoRank[] {
    return LexoRank.evenlySpaced(count);
  }

  it("returns the original rank when from === to (no-op)", () => {
    const list = seeded(5);
    const r = move(list, 2, 2, () => LexoRank.middle());
    expect(r).toBe(list[2]);
  });

  it("moves down: new rank lies between list[to] and list[to+1]", () => {
    const list = seeded(5); // A,B,C,D,E
    const r = move(list, 1, 3, () => LexoRank.middle()); // move B → after D
    expect(list[3]!.compareTo(r)).toBe(-1);
    expect(r.compareTo(list[4]!)).toBe(-1);
  });

  it("moves up: new rank lies between list[to-1] and list[to]", () => {
    const list = seeded(5);
    const r = move(list, 3, 1, () => LexoRank.middle()); // move D → between A and B
    expect(list[0]!.compareTo(r)).toBe(-1);
    expect(r.compareTo(list[1]!)).toBe(-1);
  });

  it("move to index 0 from anywhere else places below the current head", () => {
    const list = seeded(5);
    const r = move(list, 3, 0, () => LexoRank.min());
    expect(r.compareTo(list[0]!)).toBe(-1);
  });

  it("move to last index from anywhere else places above the current tail", () => {
    const list = seeded(5);
    const r = move(list, 0, 4, () => LexoRank.max());
    expect(list[4]!.compareTo(r)).toBe(-1);
  });

  it("throws on out-of-range from", () => {
    const list = seeded(3);
    expect(() => move(list, -1, 0, () => LexoRank.middle())).toThrow();
    expect(() => move(list, 3, 0, () => LexoRank.middle())).toThrow();
  });

  it("throws on out-of-range to", () => {
    const list = seeded(3);
    expect(() => move(list, 0, -1, () => LexoRank.middle())).toThrow();
    expect(() => move(list, 0, 3, () => LexoRank.middle())).toThrow();
  });

  it("throws on non-integer indices", () => {
    const list = seeded(3);
    expect(() => move(list, 1.5, 0, () => LexoRank.middle())).toThrow();
    expect(() => move(list, 0, 1.5, () => LexoRank.middle())).toThrow();
  });

  it("throws on empty list", () => {
    expect(() => move<LexoRank>([], 0, 0, () => LexoRank.middle())).toThrow();
  });
});

describe("helpers: analyze", () => {
  it("returns zeros on empty input (not a recommend)", () => {
    const a = analyze([]);
    expect(a.count).toBe(0);
    expect(a.max).toBe(0);
    expect(a.avg).toBe(0);
    expect(a.p95).toBe(0);
    expect(a.recommendRebalance).toBe(false);
  });

  it("reports length stats from toString() lengths", () => {
    const fixtures = [{ toString: () => "a" }, { toString: () => "bbb" }];
    const a = analyze(fixtures);
    expect(a.count).toBe(2);
    expect(a.max).toBe(3);
    expect(a.avg).toBe(2);
  });

  it("recommends rebalance when max exceeds 30", () => {
    const long = { toString: () => "x".repeat(31) };
    const short = { toString: () => "y" };
    expect(analyze([long, short]).recommendRebalance).toBe(true);
  });

  it("recommends rebalance when avg exceeds 15", () => {
    const ranks = new Array(10).fill({ toString: () => "z".repeat(16) });
    expect(analyze(ranks).recommendRebalance).toBe(true);
  });

  it("does not recommend rebalance on small short-ranked lists", () => {
    const a = analyze(LexoRank.evenlySpaced(100));
    expect(a.recommendRebalance).toBe(false);
  });

  it("p95 ≤ max and p95 ≥ avg for skewed samples", () => {
    const many = new Array(100).fill({ toString: () => "s" });
    many.push({ toString: () => "verylongrankstringxxxx" });
    const a = analyze(many);
    expect(a.p95).toBeLessThanOrEqual(a.max);
    expect(a.p95).toBeGreaterThanOrEqual(Math.floor(a.avg));
  });

  it("recommends using caller-supplied maxThreshold", () => {
    const ranks = [{ toString: () => "x".repeat(10) }];
    expect(analyze(ranks, { maxThreshold: 5 }).recommendRebalance).toBe(true);
    expect(analyze(ranks, { maxThreshold: 100 }).recommendRebalance).toBe(false);
  });

  it("recommends using caller-supplied avgThreshold", () => {
    const ranks = new Array(5).fill({ toString: () => "xx" });
    expect(analyze(ranks, { avgThreshold: 1 }).recommendRebalance).toBe(true);
    expect(analyze(ranks, { avgThreshold: 10 }).recommendRebalance).toBe(false);
  });

  it("overriding one threshold does not disable the other", () => {
    const ranks = [{ toString: () => "x".repeat(31) }];
    // Provide a very large avgThreshold — the default maxThreshold (30)
    // should still trip since rank length is 31.
    expect(analyze(ranks, { avgThreshold: 1000 }).recommendRebalance).toBe(true);
  });
});

describe("LexoRank static helpers", () => {
  it("rankAfter(undefined) returns middle, rankAfter(r) returns r.genNext()-like rank", () => {
    expect(LexoRank.rankAfter().value).toBe(LexoRank.middle().value);
    const prev = LexoRank.parse("c");
    const r = LexoRank.rankAfter(prev);
    expect(prev.compareTo(r)).toBe(-1);
  });

  it("rankBefore works symmetrically", () => {
    expect(LexoRank.rankBefore().value).toBe(LexoRank.middle().value);
    const next = LexoRank.parse("m");
    const r = LexoRank.rankBefore(next);
    expect(r.compareTo(next)).toBe(-1);
  });

  it("rankBetween covers all four arity combinations", () => {
    expect(LexoRank.rankBetween().value).toBe(LexoRank.middle().value);
    const a = LexoRank.parse("c");
    const b = LexoRank.parse("m");
    expect(a.compareTo(LexoRank.rankBetween(a))).toBe(-1);
    expect(LexoRank.rankBetween(undefined, b).compareTo(b)).toBe(-1);
    const mid = LexoRank.rankBetween(a, b);
    expect(a.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(b)).toBe(-1);
  });

  it("compare is usable as a sort comparator without binding", () => {
    const raw = ["z", "a", "m"].map((v) => LexoRank.parse(v));
    const sorted = [...raw].sort(LexoRank.compare);
    expect(sorted.map((r) => r.value)).toEqual(["a", "m", "z"]);
  });

  it("isValid returns false for bad inputs without throwing", () => {
    expect(LexoRank.isValid("a")).toBe(true);
    expect(LexoRank.isValid("")).toBe(false);
    expect(LexoRank.isValid("ABC")).toBe(false); // not in base36
    expect(LexoRank.isValid(null)).toBe(false);
  });

  it("move delegates to the generic helper", () => {
    const list = LexoRank.evenlySpaced(6);
    const r = LexoRank.move(list, 1, 4);
    expect(list[4]!.compareTo(r)).toBe(-1);
  });

  it("analyze on evenlySpaced(100) is well-behaved", () => {
    const list = LexoRank.evenlySpaced(100);
    const a = LexoRank.analyze(list);
    expect(a.count).toBe(100);
    expect(a.recommendRebalance).toBe(false);
  });
});

describe("LexoBucketRank static helpers", () => {
  it("rankAfter / rankBefore / rankBetween default to middle in the active bucket", () => {
    const after = LexoBucketRank.rankAfter();
    expect(after.toString()).toBe("0|i");
    const before = LexoBucketRank.rankBefore();
    expect(before.toString()).toBe("0|i");
    const between = LexoBucketRank.rankBetween();
    expect(between.toString()).toBe("0|i");
  });

  it("rankAfter / rankBefore respect activeBucket when prev/next undefined", () => {
    const r = LexoBucketRank.rankAfter(undefined, { activeBucket: "2" });
    expect(r.toString()).toBe("2|i");
  });

  it("rankBetween with both defined delegates to .between", () => {
    const a = new LexoBucketRank("0", "c");
    const b = new LexoBucketRank("0", "m");
    const r = LexoBucketRank.rankBetween(a, b);
    expect(a.compareTo(r)).toBe(-1);
    expect(r.compareTo(b)).toBe(-1);
  });

  it("compare works as a sort comparator", () => {
    const list = [new LexoBucketRank("0", "z"), new LexoBucketRank("0", "a")];
    list.sort(LexoBucketRank.compare);
    expect(list.map((r) => r.toString())).toEqual(["0|a", "0|z"]);
  });

  it("isValid rejects missing bucket separator", () => {
    expect(LexoBucketRank.isValid("0|a")).toBe(true);
    expect(LexoBucketRank.isValid("0-a")).toBe(false); // no |
    expect(LexoBucketRank.isValid("9|a")).toBe(false); // bucket not in list
  });

  it("move works within a single bucket", () => {
    const list = LexoBucketRank.evenlySpaced(5);
    const r = LexoBucketRank.move(list, 0, 4);
    expect(list[4]!.compareTo(r)).toBe(-1);
    expect(r.bucket).toBe("0");
  });

  it("analyze works on bucket lists", () => {
    const list = LexoBucketRank.evenlySpaced(50);
    const a = LexoBucketRank.analyze(list);
    expect(a.count).toBe(50);
    // Bucket prefix adds 2 chars; short bucket ranks shouldn't trigger rebalance.
    expect(a.recommendRebalance).toBe(false);
  });

  it("planRebalance defaults current to buckets[0] and advances the ring", () => {
    const plan = LexoBucketRank.planRebalance();
    expect(plan.currentBucket).toBe("0");
    expect(plan.targetBucket).toBe("1");
    expect(plan.isWrap).toBe(false);
  });

  it("planRebalance from '1' goes to '2'", () => {
    const plan = LexoBucketRank.planRebalance("1");
    expect(plan.currentBucket).toBe("1");
    expect(plan.targetBucket).toBe("2");
    expect(plan.isWrap).toBe(false);
  });

  it("planRebalance wraps from last to first", () => {
    const plan = LexoBucketRank.planRebalance("2");
    expect(plan.currentBucket).toBe("2");
    expect(plan.targetBucket).toBe("0");
    expect(plan.isWrap).toBe(true);
  });

  it("planRebalance.ranks(count) generates ranks in the target bucket", () => {
    const plan = LexoBucketRank.planRebalance("0");
    const fresh = plan.ranks(4);
    expect(fresh.length).toBe(4);
    expect(fresh.every((r) => r.bucket === "1")).toBe(true);
    for (let i = 1; i < fresh.length; i++) {
      expect(fresh[i - 1]!.compareTo(fresh[i]!)).toBe(-1);
    }
  });

  it("planRebalance rejects a currentBucket not in the configured list", () => {
    expect(() => LexoBucketRank.planRebalance("9")).toThrow();
  });

  it("planRebalance preserves migration invariants (forward: target sorts above)", () => {
    const oldRanks = LexoBucketRank.evenlySpaced(5);
    const plan = LexoBucketRank.planRebalance("0");
    const fresh = plan.ranks(5);
    // Forward: new bucket > old bucket lexicographically; every fresh rank
    // sorts after every oldRank until the migration completes.
    for (const o of oldRanks) {
      for (const n of fresh) {
        expect(o.compareTo(n)).toBe(-1);
      }
    }
  });

  it("planRebalance exposes a working directive for wrap migrations", () => {
    const plan = LexoBucketRank.planRebalance("2");
    expect(plan.isWrap).toBe(true);
    // Wrap: target sorts below source. Fresh ranks in '0' sort before any
    // un-migrated ranks in '2'.
    const fresh = plan.ranks(3);
    const stale = LexoBucketRank.evenlySpaced(3, { activeBucket: "2" });
    for (const n of fresh) {
      for (const s of stale) {
        expect(n.compareTo(s)).toBe(-1);
      }
    }
  });
});

describe("LexoDecimalRank static helpers", () => {
  it("rankAfter / rankBefore / rankBetween default to middle", () => {
    expect(LexoDecimalRank.rankAfter().toString()).toBe(
      LexoDecimalRank.middle().toString()
    );
    expect(LexoDecimalRank.rankBefore().toString()).toBe(
      LexoDecimalRank.middle().toString()
    );
    expect(LexoDecimalRank.rankBetween().toString()).toBe(
      LexoDecimalRank.middle().toString()
    );
  });

  it("rankBetween with both defined delegates to .between", () => {
    const a = new LexoDecimalRank("c", "");
    const b = new LexoDecimalRank("m", "");
    const r = LexoDecimalRank.rankBetween(a, b);
    expect(a.compareTo(r)).toBe(-1);
    expect(r.compareTo(b)).toBe(-1);
  });

  it("compare sorts by integer then decimal", () => {
    const list = [
      new LexoDecimalRank("m", "a"),
      new LexoDecimalRank("c", ""),
      new LexoDecimalRank("m", "")
    ];
    list.sort(LexoDecimalRank.compare);
    expect(list.map((r) => r.toString())).toEqual(["c00000:", "m00000:", "m00000:a"]);
  });

  it("isValid rejects missing decimal separator", () => {
    expect(LexoDecimalRank.isValid("i00000:")).toBe(true);
    expect(LexoDecimalRank.isValid("i00000")).toBe(false);
  });

  it("move works", () => {
    const list = LexoDecimalRank.evenlySpaced(5);
    const r = LexoDecimalRank.move(list, 2, 4);
    expect(list[4]!.compareTo(r)).toBe(-1);
  });

  it("analyze works", () => {
    const list = LexoDecimalRank.evenlySpaced(50);
    const a = LexoDecimalRank.analyze(list);
    expect(a.count).toBe(50);
  });
});

describe("LexoBucketDecimalRank static helpers", () => {
  it("rankAfter / rankBefore / rankBetween default to middle in active bucket", () => {
    const def = LexoBucketDecimalRank.middle().toString();
    expect(LexoBucketDecimalRank.rankAfter().toString()).toBe(def);
    expect(LexoBucketDecimalRank.rankBefore().toString()).toBe(def);
    expect(LexoBucketDecimalRank.rankBetween().toString()).toBe(def);
  });

  it("compare works as a sort comparator", () => {
    const list = [
      new LexoBucketDecimalRank("1", "a", ""),
      new LexoBucketDecimalRank("0", "m", "")
    ];
    list.sort(LexoBucketDecimalRank.compare);
    expect(list[0]!.bucket).toBe("0");
    expect(list[1]!.bucket).toBe("1");
  });

  it("isValid checks bucket + decimal separators", () => {
    expect(LexoBucketDecimalRank.isValid("0|i00000:")).toBe(true);
    expect(LexoBucketDecimalRank.isValid("0|i00000")).toBe(false); // no :
    expect(LexoBucketDecimalRank.isValid("0-i00000:")).toBe(false); // no |
  });

  it("planRebalance advances and wraps", () => {
    expect(LexoBucketDecimalRank.planRebalance("0").targetBucket).toBe("1");
    expect(LexoBucketDecimalRank.planRebalance("2").isWrap).toBe(true);
  });

  it("planRebalance.ranks produces ordered ranks in the target bucket", () => {
    const plan = LexoBucketDecimalRank.planRebalance("0");
    const fresh = plan.ranks(4);
    expect(fresh.length).toBe(4);
    expect(fresh.every((r) => r.bucket === "1")).toBe(true);
  });

  it("move works on bucket+decimal ranks", () => {
    const list = LexoBucketDecimalRank.evenlySpaced(5);
    const r = LexoBucketDecimalRank.move(list, 1, 3);
    expect(list[3]!.compareTo(r)).toBe(-1);
    expect(r.bucket).toBe("0");
  });

  it("analyze works", () => {
    const list = LexoBucketDecimalRank.evenlySpaced(50);
    const a = LexoBucketDecimalRank.analyze(list);
    expect(a.count).toBe(50);
  });
});

describe("LexoRank safe variants", () => {
  it("safeParse returns the rank on success, undefined on failure", () => {
    expect(LexoRank.safeParse("a")?.value).toBe("a");
    expect(LexoRank.safeParse("")).toBeUndefined();
    expect(LexoRank.safeParse("ABC")).toBeUndefined();
    expect(LexoRank.safeParse(null)).toBeUndefined();
  });

  it("safeRankAfter returns undefined when genNext would throw", () => {
    const atMax = new LexoRank("z"); // absolute max — genNext throws
    expect(LexoRank.safeRankAfter(atMax)).toBeUndefined();
    // Happy path still returns a rank
    expect(LexoRank.safeRankAfter(LexoRank.middle())?.value).toBeTypeOf("string");
  });

  it("safeRankBefore returns undefined at absolute min", () => {
    const atMin = new LexoRank("0");
    expect(LexoRank.safeRankBefore(atMin)).toBeUndefined();
    expect(LexoRank.safeRankBefore(LexoRank.middle())?.value).toBeTypeOf("string");
  });

  it("safeRankBetween returns undefined when the interior is empty", () => {
    const a = new LexoRank("a");
    expect(LexoRank.safeRankBetween(a, a)).toBeUndefined(); // equal bounds
    // Degenerate adjacent case: between "a" and "a0" — no rank fits.
    const prev = new LexoRank("a");
    const next = new LexoRank("a0");
    expect(LexoRank.safeRankBetween(prev, next)).toBeUndefined();
    // Happy path unchanged.
    expect(
      LexoRank.safeRankBetween(new LexoRank("c"), new LexoRank("m"))?.value
    ).toBeTypeOf("string");
  });

  it("safeRankBetween returns a fallback middle for both-undefined", () => {
    // Safe variant still exercises the fallback path — it only swallows
    // exceptions, not the all-optional branch.
    expect(LexoRank.safeRankBetween()?.value).toBe(LexoRank.middle().value);
  });

  it("safeMove returns undefined for out-of-range indices", () => {
    const list = LexoRank.evenlySpaced(3);
    expect(LexoRank.safeMove(list, -1, 0)).toBeUndefined();
    expect(LexoRank.safeMove(list, 0, 3)).toBeUndefined();
    expect(LexoRank.safeMove([], 0, 0)).toBeUndefined();
    // Happy path
    expect(LexoRank.safeMove(list, 0, 2)?.value).toBeTypeOf("string");
  });
});

describe("LexoBucketRank safe variants", () => {
  it("safeRankBetween returns undefined for cross-bucket mismatch", () => {
    const a = new LexoBucketRank("0", "a");
    const b = new LexoBucketRank("1", "z");
    expect(LexoBucketRank.safeRankBetween(a, b)).toBeUndefined();
  });

  it("safeParse rejects missing separator", () => {
    expect(LexoBucketRank.safeParse("0|a")?.toString()).toBe("0|a");
    expect(LexoBucketRank.safeParse("0-a")).toBeUndefined();
    expect(LexoBucketRank.safeParse("9|a")).toBeUndefined();
  });
});

describe("LexoDecimalRank safe variants", () => {
  it("safeParse rejects missing decimal separator", () => {
    expect(LexoDecimalRank.safeParse("i00000:")).toBeDefined();
    expect(LexoDecimalRank.safeParse("i00000")).toBeUndefined();
  });

  it("safeRankBetween returns undefined when bounds are equal", () => {
    const a = new LexoDecimalRank("a", "");
    expect(LexoDecimalRank.safeRankBetween(a, a)).toBeUndefined();
  });
});

describe("LexoBucketDecimalRank safe variants", () => {
  it("safeParse rejects bad input", () => {
    expect(LexoBucketDecimalRank.safeParse("0|i00000:")).toBeDefined();
    expect(LexoBucketDecimalRank.safeParse("9|i00000:")).toBeUndefined();
    expect(LexoBucketDecimalRank.safeParse("0-i00000:")).toBeUndefined();
  });
});

describe("helpers behave consistently with BASE36 custom alphabet", () => {
  it("rankAfter on a rank inherits its alphabet", () => {
    const prev = new LexoRank("a", BASE36);
    const next = LexoRank.rankAfter(prev);
    expect(next.alphabet).toBe(BASE36);
  });
});
