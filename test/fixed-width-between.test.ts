import { describe, it, expect } from "vitest";
import {
  genBetweenFixedWidth,
  NoFixedWidthMidpointError
} from "../src/algorithm/fixed-width-between";
import { BASE36 } from "../src/alphabet";

describe("genBetweenFixedWidth", () => {
  it("returns a midpoint at the configured width when one exists", () => {
    const r = genBetweenFixedWidth("c", "m", BASE36, 1);
    expect(r.length).toBe(1);
    expect(r > "c" && r < "m").toBe(true);
  });

  it("pads inputs on the right with the alphabet minimum character", () => {
    // 'a' padded to 4 is 'a000'; 'z' padded to 4 is 'z000'. Midpoint fits.
    const r = genBetweenFixedWidth("a", "z", BASE36, 4);
    expect(r.length).toBe(4);
    expect(r > "a000" && r < "z000").toBe(true);
  });

  it("throws when width < 1", () => {
    expect(() => genBetweenFixedWidth("a", "b", BASE36, 0)).toThrow(
      /width must be at least 1/
    );
  });

  it("throws when either input is longer than the configured width", () => {
    expect(() => genBetweenFixedWidth("abcde", "f", BASE36, 2)).toThrow(
      /Inputs exceed fixed width/
    );
    expect(() => genBetweenFixedWidth("a", "abcde", BASE36, 2)).toThrow(
      /Inputs exceed fixed width/
    );
  });

  it("throws when prev and next pad to the same string", () => {
    // 'a' and 'a0' both pad to 'a0' at width 2.
    expect(() => genBetweenFixedWidth("a", "a0", BASE36, 2)).toThrow(
      /strictly less than next/
    );
  });

  it("throws when prev pads to strictly greater than next", () => {
    expect(() => genBetweenFixedWidth("b", "a", BASE36, 1)).toThrow(
      /strictly less than next/
    );
  });

  it("throws NoFixedWidthMidpointError when integers are adjacent at the width", () => {
    expect(() => genBetweenFixedWidth("y", "z", BASE36, 1)).toThrow(
      NoFixedWidthMidpointError
    );
  });

  it("NoFixedWidthMidpointError carries a descriptive name and message", () => {
    try {
      genBetweenFixedWidth("y", "z", BASE36, 1);
      throw new Error("expected NoFixedWidthMidpointError to be thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NoFixedWidthMidpointError);
      expect((e as Error).name).toBe("NoFixedWidthMidpointError");
      expect((e as Error).message).toMatch(/No rank exists at width/);
    }
  });
});
