import { describe, it, expect, vi } from "vitest";
import { LexoRank } from "../src/ranks/lexo-rank";
import { LexoBucketRank } from "../src/ranks/lexo-bucket-rank";
import { LexoDecimalRank } from "../src/ranks/lexo-decimal-rank";
import { LexoBucketDecimalRank } from "../src/ranks/lexo-bucket-decimal-rank";
import { createLexoRank } from "../src/factory";

// Monitor fires only on ranks produced by between / genNext / genPrev.
// It does NOT fire on constructors, parse, min/max/middle, or bucket moves.

describe("RebalanceMonitor — LexoRank", () => {
  it("fires on between when the result exceeds the threshold", () => {
    const onRebalanceNeeded = vi.fn();
    const monitor = { rebalanceThreshold: 0, onRebalanceNeeded };
    // Any non-empty LexoRank has length >= 1, so threshold 0 guarantees the fire.
    const a = new LexoRank("a", undefined, monitor);
    const b = new LexoRank("z", undefined, monitor);
    const mid = LexoRank.between(a, b);
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(1);
    expect(onRebalanceNeeded).toHaveBeenCalledWith(mid);
  });

  it("fires on genNext and genPrev when the result exceeds the threshold", () => {
    const onRebalanceNeeded = vi.fn();
    const monitor = { rebalanceThreshold: 0, onRebalanceNeeded };
    const r = new LexoRank("i", undefined, monitor);
    r.genNext();
    r.genPrev();
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(2);
  });

  it("does NOT fire on constructor, parse, min, max, or middle", () => {
    const onRebalanceNeeded = vi.fn();
    const monitor = { rebalanceThreshold: 0, onRebalanceNeeded };
    new LexoRank("a", undefined, monitor);
    LexoRank.parse("b", undefined, monitor);
    LexoRank.min(undefined, monitor);
    LexoRank.max(undefined, monitor);
    LexoRank.middle(undefined, monitor);
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });

  it("does NOT fire when the result length is at or below the threshold", () => {
    const onRebalanceNeeded = vi.fn();
    const monitor = { rebalanceThreshold: 10, onRebalanceNeeded };
    const a = new LexoRank("a", undefined, monitor);
    const b = new LexoRank("z", undefined, monitor);
    LexoRank.between(a, b); // result is 1 char
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });

  it("does not fire when only threshold (no callback) is given", () => {
    const r = new LexoRank("a", undefined, { rebalanceThreshold: 0 });
    // No callback, so nothing observable happens. The method should just work.
    expect(() => r.genNext()).not.toThrow();
  });

  it("monitor is inherited through a chain of generated ranks", () => {
    const onRebalanceNeeded = vi.fn();
    const monitor = { rebalanceThreshold: 0, onRebalanceNeeded };
    const cur = new LexoRank("a", undefined, monitor);
    // Three generations of derivation — each should fire exactly once.
    cur.genNext().genNext().genNext();
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(3);
  });

  it("handler runs synchronously from inside the method", () => {
    const observed: string[] = [];
    const a = new LexoRank("a", undefined, {
      rebalanceThreshold: 0,
      onRebalanceNeeded: (r) => observed.push(r.value)
    });
    const b = new LexoRank("z", undefined, {
      rebalanceThreshold: 0,
      onRebalanceNeeded: (r) => observed.push(r.value)
    });
    observed.push("before");
    LexoRank.between(a, b);
    observed.push("after");
    // Callback runs synchronously between "before" and "after".
    expect(observed).toEqual(["before", expect.any(String), "after"]);
  });

  it("handler exceptions propagate (not swallowed)", () => {
    const a = new LexoRank("a", undefined, {
      rebalanceThreshold: 0,
      onRebalanceNeeded: () => {
        throw new Error("boom");
      }
    });
    const b = new LexoRank("z", undefined, {
      rebalanceThreshold: 0,
      onRebalanceNeeded: () => {
        throw new Error("boom");
      }
    });
    expect(() => LexoRank.between(a, b)).toThrow("boom");
  });
});

describe("RebalanceMonitor — LexoBucketRank", () => {
  it("fires on between / genNext / genPrev only", () => {
    const onRebalanceNeeded = vi.fn();
    const config = { rebalanceThreshold: 0, onRebalanceNeeded };

    const a = new LexoBucketRank("0", "a", config);
    const b = new LexoBucketRank("0", "z", config);
    expect(onRebalanceNeeded).not.toHaveBeenCalled(); // constructors

    LexoBucketRank.parse("0|m", config);
    LexoBucketRank.min(config);
    LexoBucketRank.max(config);
    LexoBucketRank.middle(config);
    expect(onRebalanceNeeded).not.toHaveBeenCalled(); // parse / seeds

    LexoBucketRank.between(a, b);
    a.genNext();
    a.genPrev();
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(3);
  });

  it("does NOT fire on inBucket (no new rank was derived)", () => {
    const onRebalanceNeeded = vi.fn();
    const config = { rebalanceThreshold: 0, onRebalanceNeeded };
    const r = new LexoBucketRank("0", "i", config);
    r.inBucket("1");
    r.inBucket("2");
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });

  it("respects the threshold boundary (strict >)", () => {
    const onRebalanceNeeded = vi.fn();
    const config = { rebalanceThreshold: 3, onRebalanceNeeded };
    const a = new LexoBucketRank("0", "a", config);
    const b = new LexoBucketRank("0", "z", config);
    // Result is "0|m" — length 3. 3 > 3 is false, should not fire.
    LexoBucketRank.between(a, b);
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });
});

describe("RebalanceMonitor — LexoDecimalRank", () => {
  it("fires when the decimal tail forces the rank over the threshold", () => {
    const onRebalanceNeeded = vi.fn();
    const config = {
      integerWidth: 1,
      rebalanceThreshold: 2, // rendered default "a:" is length 2
      onRebalanceNeeded
    };
    // Construct adjacent integers at width 1 → between() must grow the
    // decimal tail, producing length-3 results like "a:m".
    const a = new LexoDecimalRank("a", "", config);
    const b = new LexoDecimalRank("b", "", config);
    LexoDecimalRank.between(a, b);
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire on parse or seed constructors", () => {
    const onRebalanceNeeded = vi.fn();
    const config = { rebalanceThreshold: 0, onRebalanceNeeded };
    new LexoDecimalRank("abcdef", "longdecimaltail", {
      ...config,
      integerWidth: 6
    });
    LexoDecimalRank.parse("i00000:anylongvalue", config);
    LexoDecimalRank.min(config);
    LexoDecimalRank.max(config);
    LexoDecimalRank.middle(config);
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });
});

describe("RebalanceMonitor — LexoBucketDecimalRank", () => {
  it("fires on between / genNext / genPrev only", () => {
    const onRebalanceNeeded = vi.fn();
    const config = {
      integerWidth: 1,
      rebalanceThreshold: 0,
      onRebalanceNeeded
    };
    const a = new LexoBucketDecimalRank("0", "a", "", config);
    const b = new LexoBucketDecimalRank("0", "b", "", config);
    LexoBucketDecimalRank.parse("0|a:m", config);
    LexoBucketDecimalRank.min(config);
    LexoBucketDecimalRank.max(config);
    LexoBucketDecimalRank.middle(config);
    expect(onRebalanceNeeded).not.toHaveBeenCalled();

    LexoBucketDecimalRank.between(a, b);
    a.genNext();
    a.genPrev();
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(3);
  });

  it("does NOT fire on bucket moves", () => {
    const onRebalanceNeeded = vi.fn();
    const config = { rebalanceThreshold: 0, onRebalanceNeeded };
    const r = new LexoBucketDecimalRank("0", "i", "", config);
    r.inBucket("1");
    r.inBucket("2");
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });
});

describe("RebalanceMonitor — createLexoRank factory", () => {
  it("threads the monitor through simple mode", () => {
    const onRebalanceNeeded = vi.fn();
    const R = createLexoRank({ rebalanceThreshold: 0, onRebalanceNeeded });
    R.between(R.min(), R.max());
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(1);
  });

  it("threads the monitor through bucket mode", () => {
    const onRebalanceNeeded = vi.fn();
    const R = createLexoRank({
      bucket: true,
      rebalanceThreshold: 0,
      onRebalanceNeeded
    });
    R.between(R.min(), R.max());
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(1);
  });

  it("threads the monitor through decimal mode", () => {
    const onRebalanceNeeded = vi.fn();
    const R = createLexoRank({
      decimal: true,
      rebalanceThreshold: 0,
      onRebalanceNeeded
    });
    R.between(R.min(), R.max());
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(1);
  });

  it("threads the monitor through bucket+decimal mode", () => {
    const onRebalanceNeeded = vi.fn();
    const R = createLexoRank({
      bucket: true,
      decimal: true,
      rebalanceThreshold: 0,
      onRebalanceNeeded
    });
    R.between(R.min(), R.max());
    expect(onRebalanceNeeded).toHaveBeenCalledTimes(1);
  });

  it("does not fire on min / max / middle / parse via factory", () => {
    const onRebalanceNeeded = vi.fn();
    const R = createLexoRank({
      bucket: true,
      rebalanceThreshold: 0,
      onRebalanceNeeded
    });
    R.min();
    R.max();
    R.middle();
    R.parse(R.middle().toString());
    expect(onRebalanceNeeded).not.toHaveBeenCalled();
  });

  it("omitting only the callback disables monitoring", () => {
    // Should not throw, and the threshold alone has no observable effect.
    const R = createLexoRank({ rebalanceThreshold: 0 });
    expect(() => R.between(R.min(), R.max())).not.toThrow();
  });
});
