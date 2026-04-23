import { describe, it, expect } from "vitest";
import { createLexoRank } from "../src/factory";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";

describe("factory module: helper surface — simple", () => {
  const R = createLexoRank();

  it("exposes compare usable with Array#sort", () => {
    const list = ["z", "a", "m"].map((v) => R.parse(v));
    list.sort(R.compare);
    expect(list.map((r) => r.toString())).toEqual(["a", "m", "z"]);
  });

  it("rankAfter / rankBefore / rankBetween cover the drag-and-drop cases", () => {
    expect(R.rankAfter().toString()).toBe(R.middle().toString());
    expect(R.rankBefore().toString()).toBe(R.middle().toString());
    expect(R.rankBetween().toString()).toBe(R.middle().toString());

    const a = R.parse("c");
    const b = R.parse("m");
    expect(a.compareTo(R.rankAfter(a))).toBe(-1);
    expect(R.rankBefore(b).compareTo(b)).toBe(-1);
    const mid = R.rankBetween(a, b);
    expect(a.compareTo(mid)).toBe(-1);
    expect(mid.compareTo(b)).toBe(-1);
  });

  it("move works", () => {
    const list = R.evenlySpaced(5);
    const r = R.move(list, 0, 4);
    expect(list[4]!.compareTo(r)).toBe(-1);
  });

  it("isValid works", () => {
    expect(R.isValid("a")).toBe(true);
    expect(R.isValid("")).toBe(false);
  });

  it("analyze works", () => {
    const list = R.evenlySpaced(50);
    const a = R.analyze(list);
    expect(a.count).toBe(50);
    expect(a.recommendRebalance).toBe(false);
  });

  it("analyze reads thresholds from the module config", () => {
    // rebalanceThreshold → maxThreshold override.
    const Strict = createLexoRank({
      rebalanceThreshold: 0, // any rank longer than 0 trips
      onRebalanceNeeded: () => void 0
    });
    const list = Strict.evenlySpaced(5);
    expect(Strict.analyze(list).recommendRebalance).toBe(true);
  });

  it("analyze config threshold is overridable per-call", () => {
    const Strict = createLexoRank({
      rebalanceThreshold: 0,
      onRebalanceNeeded: () => void 0
    });
    const list = Strict.evenlySpaced(5);
    // Pass large overrides at call site — should win over module config.
    expect(
      Strict.analyze(list, { maxThreshold: 999, avgThreshold: 999 }).recommendRebalance
    ).toBe(false);
  });

  it("exposes safe* variants that return undefined on failure", () => {
    expect(R.safeParse("a")?.toString()).toBe("a");
    expect(R.safeParse("")).toBeUndefined();
    expect(R.safeParse(null)).toBeUndefined();

    expect(R.safeRankAfter(R.parse("z"))).toBeUndefined(); // at absolute max
    expect(R.safeRankBefore(R.parse("0"))).toBeUndefined(); // at absolute min

    const a = R.parse("a");
    expect(R.safeRankBetween(a, a)).toBeUndefined(); // equal bounds

    const list = R.evenlySpaced(3);
    expect(R.safeMove(list, -1, 0)).toBeUndefined();
    expect(R.safeMove(list, 0, 2)?.toString()).toBeTypeOf("string");
  });

  it("rebalanceAvgThreshold flows through the module config", () => {
    const R2 = createLexoRank({
      rebalanceAvgThreshold: 0
    });
    const list = R2.evenlySpaced(5);
    expect(R2.analyze(list).recommendRebalance).toBe(true);
  });
});

describe("factory module: helper surface — bucket", () => {
  const R = createLexoRank({ bucket: true });

  it("planRebalance advances from current bucket", () => {
    const plan = R.planRebalance("0");
    expect(plan.currentBucket).toBe("0");
    expect(plan.targetBucket).toBe("1");
    expect(plan.isWrap).toBe(false);
    const fresh = plan.ranks(3);
    expect(fresh.length).toBe(3);
    expect(fresh.every((r) => r.bucket === "1")).toBe(true);
  });

  it("planRebalance defaults currentBucket to the module's activeBucket", () => {
    const R2 = createLexoRank({ bucket: true, activeBucket: "1" });
    const plan = R2.planRebalance();
    expect(plan.currentBucket).toBe("1");
    expect(plan.targetBucket).toBe("2");
  });

  it("compare / move / isValid / analyze also wired up", () => {
    const list = R.evenlySpaced(5);
    list.sort(R.compare);
    expect(R.move(list, 0, 4).compareTo(list[0]!)).toBe(1);
    expect(R.isValid("0|a")).toBe(true);
    expect(R.isValid("9|a")).toBe(false);
    expect(R.analyze(list).count).toBe(5);
  });

  it("planRebalance returned ranks preserve forward migration invariant", () => {
    const plan = R.planRebalance("0");
    const oldRanks = LexoBucketRank.evenlySpaced(3, { activeBucket: "0" });
    const fresh = plan.ranks(3);
    for (const o of oldRanks)
      for (const n of fresh) {
        expect(o.compareTo(n)).toBe(-1);
      }
  });
});

describe("factory module: helper surface — decimal", () => {
  const R = createLexoRank({ decimal: true });

  it("compare / rankBetween / isValid / analyze / move wired", () => {
    const a = R.parse("c:");
    const b = R.parse("m:");
    expect(a.compareTo(R.rankBetween(a, b))).toBe(-1);
    expect(R.isValid("i00000:")).toBe(true);
    expect(R.isValid("i00000")).toBe(false);
    const list = R.evenlySpaced(10);
    list.sort(R.compare);
    expect(R.move(list, 0, 9).compareTo(list[0]!)).toBe(1);
    expect(R.analyze(list).count).toBe(10);
  });
});

describe("factory module: helper surface — bucket+decimal", () => {
  const R = createLexoRank({ bucket: true, decimal: true });

  it("planRebalance / move / compare all threaded", () => {
    const plan = R.planRebalance("0");
    expect(plan.targetBucket).toBe("1");
    const fresh = plan.ranks(3);
    expect(fresh.every((r) => r.bucket === "1")).toBe(true);

    const list = R.evenlySpaced(5);
    list.sort(R.compare);
    expect(R.move(list, 0, 4).compareTo(list[0]!)).toBe(1);
    expect(R.isValid("0|i00000:")).toBe(true);
    expect(R.isValid("9|i00000:")).toBe(false);
  });
});
