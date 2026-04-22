#!/usr/bin/env node
// Post-build smoke test: import the published entry points (both ESM and CJS)
// and assert the expected public surface actually works. Catches regressions
// in `src/index.ts` re-exports, tsup/DTS config, and package.json `exports`
// wiring that unit tests (which import from src/) can't see.
//
// Run with: `node scripts/smoke.mjs` after `npm run build`.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "..", "dist");

let failures = 0;
const pass = (name) => console.log(`  ✓ ${name}`);
const fail = (name, err) => {
  failures++;
  console.error(`  ✗ ${name}`);
  console.error(`    ${err.message}`);
};

async function check(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

function exerciseSurface(mod, label) {
  // Expected public surface — new items should be added here deliberately.
  const expected = [
    "LexoRank",
    "LexoBucketRank",
    "LexoDecimalRank",
    "LexoBucketDecimalRank",
    "createLexoRank",
    "rankBetween",
    "genBetween",
    "evenlySpaced",
    "StringAlphabet",
    "BASE36",
    "BASE62",
    "NUMERIC",
    "LOWER_ALPHA",
    "UPPER_ALPHA",
    "alphabetFromRange",
    "alphabetFromSamples",
    "DEFAULT_BUCKETS",
    "DEFAULT_BUCKET_SEPARATOR",
    "DEFAULT_DECIMAL_SEPARATOR",
    "DEFAULT_INTEGER_WIDTH",
    "MAX_INTEGER_WIDTH",
    "MAX_RANK_LENGTH"
  ];
  const missing = expected.filter((name) => mod[name] === undefined);
  assert.equal(missing.length, 0, `[${label}] missing exports: ${missing.join(", ")}`);

  // Exercise each of the four rank classes via the factory.
  const modes = [
    { config: {}, expectInstance: mod.LexoRank },
    { config: { bucket: true }, expectInstance: mod.LexoBucketRank },
    { config: { decimal: true }, expectInstance: mod.LexoDecimalRank },
    {
      config: { bucket: true, decimal: true },
      expectInstance: mod.LexoBucketDecimalRank
    }
  ];
  for (const { config, expectInstance } of modes) {
    const R = mod.createLexoRank(config);
    const lo = R.min();
    const hi = R.max();
    const mid = R.middle();
    const between = R.between(lo, hi);
    const parsed = R.parse(mid.toString());

    assert.ok(lo instanceof expectInstance, `[${label}] min() instance`);
    assert.equal(lo.compareTo(hi), -1, `[${label}] lo < hi`);
    assert.equal(lo.compareTo(between), -1, `[${label}] lo < between`);
    assert.equal(between.compareTo(hi), -1, `[${label}] between < hi`);
    assert.equal(parsed.toString(), mid.toString(), `[${label}] parse round-trips`);
  }

  // Constants have the expected values.
  assert.equal(mod.MAX_INTEGER_WIDTH, 256, `[${label}] MAX_INTEGER_WIDTH`);
  assert.equal(mod.MAX_RANK_LENGTH, 1024, `[${label}] MAX_RANK_LENGTH`);
  assert.equal(mod.DEFAULT_INTEGER_WIDTH, 6, `[${label}] DEFAULT_INTEGER_WIDTH`);
  assert.equal(
    mod.DEFAULT_DECIMAL_SEPARATOR,
    ":",
    `[${label}] DEFAULT_DECIMAL_SEPARATOR`
  );
  assert.equal(mod.DEFAULT_BUCKET_SEPARATOR, "|", `[${label}] DEFAULT_BUCKET_SEPARATOR`);

  // Core validation paths still bite from the built artifact.
  assert.throws(
    () => mod.createLexoRank({ bucket: "yes" }),
    /must be a boolean/,
    `[${label}] bucket boolean guard`
  );
  assert.throws(
    () => mod.LexoDecimalRank.middle({ integerWidth: 0 }),
    /at least 1/,
    `[${label}] integerWidth guard`
  );

  // evenlySpaced smoke
  const esLo = mod.LexoRank.min();
  const esHi = mod.LexoRank.max();
  const esResult = mod.evenlySpaced(esLo, esHi, 10);
  assert.equal(esResult.length, 10, `[${label}] evenlySpaced count`);
  for (let i = 1; i < esResult.length; i++) {
    assert.equal(
      esResult[i - 1].compareTo(esResult[i]),
      -1,
      `[${label}] evenlySpaced ordering`
    );
  }

  // evenlySpaced / evenlySpacedInBucket on factory module
  const modBucket = mod.createLexoRank({ bucket: true });
  const fresh = modBucket.evenlySpaced(5);
  assert.equal(fresh.length, 5, `[${label}] factory evenlySpaced count`);
  assert.ok(
    fresh.every((r) => r.bucket === "0"),
    `[${label}] factory evenlySpaced defaults to buckets[0]`
  );
  const targetBucket = modBucket.evenlySpacedInBucket("2", 5);
  assert.ok(
    targetBucket.every((r) => r.bucket === "2"),
    `[${label}] factory evenlySpacedInBucket targets the named bucket`
  );
  // activeBucket path — simulate post-migration state.
  const modActive = mod.createLexoRank({ bucket: true, activeBucket: "1" });
  assert.equal(modActive.min().bucket, "1", `[${label}] activeBucket redirects min`);
  assert.ok(
    modActive.evenlySpaced(3).every((r) => r.bucket === "1"),
    `[${label}] activeBucket threads through evenlySpaced`
  );
  // Migration invariant: every rank in a later bucket sorts above every rank in an earlier one.
  for (const a of fresh) {
    for (const b of targetBucket) {
      assert.equal(
        a.compareTo(b),
        -1,
        `[${label}] target-bucket ranks sort after active-bucket ranks`
      );
    }
  }

  // rebalance monitor smoke — fires on between, not on seeds/parse.
  let fires = 0;
  const monitored = mod.createLexoRank({
    bucket: true,
    rebalanceThreshold: 0,
    onRebalanceNeeded: () => {
      fires++;
    }
  });
  monitored.min();
  monitored.max();
  monitored.middle();
  monitored.parse(monitored.middle().toString());
  assert.equal(fires, 0, `[${label}] monitor skipped seeds and parse`);
  monitored.between(monitored.min(), monitored.max());
  assert.equal(fires, 1, `[${label}] monitor fired on between`);
}

console.log("lexo-rank smoke test");
console.log(`  dist: ${distDir}`);

await check("dist/index.js exists (ESM)", async () => {
  const esm = await import(resolve(distDir, "index.js"));
  exerciseSurface(esm, "esm");
});

await check("dist/index.cjs exists (CJS)", async () => {
  const require = createRequire(import.meta.url);
  const cjs = require(resolve(distDir, "index.cjs"));
  exerciseSurface(cjs, "cjs");
});

await check("dist/index.d.ts has public type names", async () => {
  const { readFile } = await import("node:fs/promises");
  const dts = await readFile(resolve(distDir, "index.d.ts"), "utf8");
  for (const name of [
    "LexoRank",
    "LexoBucketRank",
    "LexoDecimalRank",
    "LexoBucketDecimalRank",
    "createLexoRank",
    "CreateLexoRankOptions",
    "LexoRankModule",
    "Alphabet"
  ]) {
    assert.match(
      dts,
      new RegExp(`\\b${name}\\b`),
      `d.ts missing declaration for '${name}'`
    );
  }
});

if (failures > 0) {
  console.error(`\n${failures} smoke-test failure(s).`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
