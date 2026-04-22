# lexo-rank

A flexible LexoRank implementation in TypeScript. Generate string ranks that sort lexicographically and can be inserted between any two existing ranks without reindexing the rest of the list.

Zero runtime dependencies. Ships ESM + CJS + `.d.ts`.

## The four modes

`bucket` and `decimal` are **independent toggles**. Turn either, both, or neither on, and you get one of four rank shapes:

| Bucket | Decimal | Shape       | Class                   | Factory                                           |
| :----: | :-----: | ----------- | ----------------------- | ------------------------------------------------- |
|   ✗    |    ✗    | `abc`       | `LexoRank`              | `createLexoRank()`                                |
|   ✓    |    ✗    | `0\|abc`    | `LexoBucketRank`        | `createLexoRank({ bucket: true })`                |
|   ✗    |    ✓    | `abc:42`    | `LexoDecimalRank`       | `createLexoRank({ decimal: true })`               |
|   ✓    |    ✓    | `0\|abc:42` | `LexoBucketDecimalRank` | `createLexoRank({ bucket: true, decimal: true })` |

Note : decimal doesn't only mean numerical decimals, it uses any character in the provided alphabet. The term decimal is used to describe the tail of a string, placed after a right-padded base, split by the provided separator.

Rules of thumb for picking a mode:

- **Bucket?** Turn it on if you want a cheap "rebalance everything at once"
  mechanism — migrate rows into the next bucket when the current one gets dense.
  Not needed for small or infrequently-updated lists.
- **Decimal?** Turn it on when you want the coarse rank to **stay short** even
  under dense insertions. The integer part is fixed-width; neighbours that run
  out of integer space grow a variable-length decimal tail instead of extending
  the integer. Not needed if you don't mind ranks gradually getting longer.
- **Bucket + Decimal (Full Jira format)** when you want to combine both, more
  complex but works well with VERY large collections that have lots of hot paths.

## Install

```sh
npm install lexo-rank
```

## Quick start

```ts
import { LexoRank } from "lexo-rank";

// Defaults to the BASE36 alphabet (0-9a-z).
const first = LexoRank.min(); // '1'
const last = LexoRank.max(); // 'y'
const middle = LexoRank.middle(); // 'i'

// Rank strictly between two others
const between = LexoRank.between(first, middle);

// Or step relative to a known rank
middle.genNext(); // a rank greater than 'i'
middle.genPrev(); // a rank less than 'i'

// Sort
[last, first, middle].sort((a, b) => a.compareTo(b));
```

## Each mode in detail

### Base — `LexoRank`

Just a rank string. The most lightweight option.

```ts
const r = LexoRank.middle(); // 'i'
r.value; // 'i'
r.toString(); // 'i'
```

### Bucket + Base — `LexoBucketRank`

Prefixes the rank with a **single-character bucket identifier** and a separator (default `|`). Buckets exist so you can rebalance by migrating every row into a fresh bucket in the ring (`0 → 1 → 2 → 0`) and regenerating short ranks in the new space.

```ts
const r = LexoBucketRank.middle(); // '0|i'
r.bucket; // '0'
r.value; // 'i'

r.inBucket("1"); // '1|i'   — move to any named bucket, value unchanged

LexoBucketRank.parse("0|hzzzzz");
```

Bucket identifiers **must** be:

- At least 2 of them (a single bucket disables rebalancing).
- Exactly one character each.
- Unique.
- In strictly ascending lex order (so array order matches rendered-rank sort order).

### Base + Decimal — `LexoDecimalRank`

Splits the rank into a fixed-width **integer** part and a variable-length **decimal** part (default separator `:`). The coarse integer gives ordering; when two neighbours share the same integer (no room to split it further), new ranks grow the decimal instead.

```ts
const r = LexoDecimalRank.middle(); // 'i00000:'
r.integer; // 'i00000'  — always width chars (default 6)
r.decimal; // ''        — empty until two neighbours collide

// Midpoint when integer space still has room
LexoDecimalRank.between(
  LexoDecimalRank.parse("100000:"),
  LexoDecimalRank.parse("y00000:")
).toString(); // 'j00000:'  (plain integer midpoint, empty decimal)
```

Think of this as base-36 "integer.decimal" arithmetic: the integer is the
whole-number part, the decimal is the fractional refinement.

### Bucket + Base + Decimal — `LexoBucketDecimalRank`

The full Jira format: `<bucket>|<integer>:<decimal>`.

```ts
const r = LexoBucketDecimalRank.middle(); // '0|i00000:'
r.bucket; // '0'
r.integer; // 'i00000'
r.decimal; // ''

LexoBucketDecimalRank.parse("0|hzzzzr:");
```

## `createLexoRank` factory

One entry point that builds any of the four variants based on the boolean toggles. The return type narrows so the instance is strongly typed.

```ts
import { createLexoRank, BASE62 } from "lexo-rank";

createLexoRank(); // → LexoRank
createLexoRank({ bucket: true }); // → LexoBucketRank
createLexoRank({ decimal: true }); // → LexoDecimalRank
createLexoRank({ bucket: true, decimal: true }); // → LexoBucketDecimalRank

// Plug in a custom alphabet independently of which mode you pick
createLexoRank({ alphabet: BASE62 });
createLexoRank({ range: "0-9A-Za-z" });
createLexoRank({ samples: ["abc", "xyz", "mno"] }); // infer smallest covering

// Everything together
const R = createLexoRank({
  bucket: true,
  decimal: true,
  alphabet: BASE62,
  buckets: ["0", "1", "2"],
  bucketSeparator: "|",
  decimalSeparator: ":",
  integerWidth: 6
});
```

### Options

| Option               | Type                | Default         | Notes                                                             |
| -------------------- | ------------------- | --------------- | ----------------------------------------------------------------- |
| `alphabet`           | `Alphabet`          | `BASE36`        | Takes precedence over `range`/`samples`.                          |
| `range`              | `string`            | —               | Range spec like `"0-9a-z"`; dashes between chars expand.          |
| `samples`            | `readonly string[]` | —               | Infer the smallest alphabet covering every sample.                |
| `bucket`             | `boolean`           | `false`         | Enable bucket prefix.                                             |
| `decimal`            | `boolean`           | `false`         | Enable integer/decimal split.                                     |
| `buckets`            | `readonly string[]` | `["0","1","2"]` | Bucket identifiers (see rules in the Bucket section).             |
| `bucketSeparator`    | `string`            | `"\|"`          | Single character, not in alphabet, not in any bucket.             |
| `decimalSeparator`   | `string`            | `":"`           | Single character, not in alphabet.                                |
| `integerWidth`       | `number`            | `6`             | Positive integer ≤ `MAX_INTEGER_WIDTH` (256). Decimal-mode only.  |
| `rebalanceThreshold` | `number`            | —               | Fire `onRebalanceNeeded` when a derived rank exceeds this length. |
| `onRebalanceNeeded`  | `(rank) => void`    | —               | Sync callback for the above. See the Monitoring section.          |

## API (common shape)

Every rank class exposes:

| Member                         | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| `static min(config?)`          | Safe minimum rank — leaves room below for `genPrev`. |
| `static max(config?)`          | Safe maximum rank — leaves room above for `genNext`. |
| `static middle(config?)`       | A good starting rank, middle of the space.           |
| `static between(a, b)`         | Rank strictly between — order-insensitive.           |
| `static parse(raw, config?)`   | Parse from a stored string.                          |
| `rank.genNext()` / `genPrev()` | Step to a greater / lesser rank.                     |
| `rank.between(other)`          | Instance form of `between`.                          |
| `rank.compareTo(other)`        | Returns `-1`, `0`, or `1`.                           |
| `rank.equals(other)`           | Structural equality (all config fields).             |
| `rank.toString()`              | The rendered rank string.                            |

Bucket variants add `inBucket(name)` / `getBucket()`, plus `evenlySpacedInBucket(name, count)` on the static and factory-module surface.

## Monitoring rebalance need

You rarely want to watch rank length yourself from the outside. Hand the
library a callback and a threshold instead; it fires the callback whenever a
freshly-derived rank exceeds the threshold — a reliable signal that the rank
space in a given bucket is getting dense.

```ts
const R = createLexoRank({
  bucket: true,
  rebalanceThreshold: 30, // fire when rank.toString().length > 30
  onRebalanceNeeded: (rank) => {
    rebalanceQueue.enqueue(rank.bucket);
  }
});
```

**Contract:**

- Monitoring is only active when **both** `rebalanceThreshold` and
  `onRebalanceNeeded` are set. Omit either to disable.
- The callback fires **only on ranks that were derived** from existing ones
  — specifically `between` (static and instance), `genNext`, and `genPrev`.
- **Does NOT fire** on: direct constructors, `parse`, `min`, `max`, `middle`,
  or `inBucket`. Loading stored ranks, seeding the list, or moving a rank
  sideways into another bucket isn't new work; there's nothing actionable
  to report.
- The callback is **synchronous** — it runs inside the method that produced
  the rank, before that method returns. If you want to do async work, do it
  fire-and-forget inside your handler and manage your own errors.
- **No deduping** — fires once per triggering call. Debounce or throttle in
  your handler if you don't want to process every fire (e.g. "only enqueue
  once per bucket per minute").
- The monitor is inherited automatically: if `a` has a monitor and you call
  `a.between(b)` or `a.genNext()`, the derivative rank carries the same
  monitor, so a chain of generated ranks all feed the same handler.

## Alphabet helpers

- Presets: `NUMERIC`, `LOWER_ALPHA`, `UPPER_ALPHA`, `BASE36`, `BASE62`.
- `new StringAlphabet(chars)` — custom alphabet. Must be **≥ 4 strictly
  ascending characters** and contain only **BMP single UTF-16 code units**
  (surrogate pairs / most emoji are rejected).
- `alphabetFromRange("0-9a-z")` — expand a range spec.
- `alphabetFromSamples([...])` — minimum alphabet covering the samples.

## Low-level primitives

```ts
import { genBetween, rankBetween, evenlySpaced, MAX_RANK_LENGTH } from "lexo-rank";

// genBetween is the core algorithm; rankBetween defaults to BASE36.
genBetween("a", "z", BASE36);
rankBetween("a", "z");

// evenlySpaced generates N strictly-ordered ranks between two bounds,
// using a recursive binary-split so lengths stay logarithmic in N.
// Works with any rank class that has a `.between(other)` method.
const fresh = evenlySpaced(LexoRank.min(), LexoRank.max(), 100);

// More ergonomic wrappers live on each class + the factory module:
LexoRank.evenlySpaced(100); // defaults to min/max
LexoBucketRank.evenlySpaced(100); // active bucket (defaults to buckets[0])
LexoBucketRank.evenlySpaced(100, { activeBucket: "1" }); // post-migration, live in "1"
LexoBucketRank.evenlySpacedInBucket("2", 100); // migration helper: target "2"
createLexoRank({ bucket: true, activeBucket: "1" }).evenlySpaced(100);
createLexoRank({ bucket: true }).evenlySpacedInBucket("2", 100);
```

## How it works

Strings sort alphabetically the same way decimals sort numerically: `"abc" < "abd"`, `"abc" < "abcz"`. So if you treat each rank as a number written in some base (36 by default), finding a rank "between" two others becomes basic maths.

**Finding a midpoint.** To insert between `"a"` and `"c"`, pick the midpoint: `"b"`. Between `"a"` and `"z"`, the midpoint is `"m"`. Simple.

**When the midpoint "disappears".** Between `"a"` and `"b"` the arithmetic midpoint rounds back to `"a"` — we can't return that, it would equal `prev`. So we **add one more character of precision** and try again: at two characters we get `"am"`, which is strictly greater than `"a"` and strictly less than `"b"`. Ranks only grow in length when dense inserts demand it.

**Decimal mode.** The "base" part is capped at `integerWidth` characters. When two neighbours share adjacent integers at max width (no room to split further), the algorithm stops growing the integer and grows the decimal tail after the separator `:` instead — same idea as integer and decimals.

**Buckets.** A bucket is a single-character prefix (default `"0"`, `"1"`, `"2"`) that lets you rebalance every row at once by migrating them into the next slot in a ring. Normal inserts (`between`, `genNext`, `genPrev`) never cross buckets. See the [Rebalancing section](#rebalancing) for the full protocol — this library gives you the primitives but doesn't run the migration for you.

## Rebalancing

Dense inserts make ranks grow. **Rebalancing** regenerates fresh, short, evenly-spaced ranks for every item. This library gives you the primitives; you run the operation against your database — it's deliberately outside the library's scope because it's a maintenance operation, not a rank-math operation.

### When to rebalance

- **Monitor rank length.** Under random inserts, ranks grow logarithmically and you'll rarely need to rebalance. Under adversarial patterns (always inserting at the top or bottom of a list), ranks grow linearly. A simple trigger: rebalance when the longest rank in a bucket passes a threshold (say 30 chars), or when the average exceeds ~15.
- **Wire up the monitor callback.** `rebalanceThreshold` + `onRebalanceNeeded` fire from derivative ranks once they exceed the threshold — see the [Monitoring section](#monitoring-rebalance-need). Debounce inside the handler if you don't want a fire per insert.
- **Or just schedule it.** Many teams run a rebalance during a low-traffic window (nightly maintenance, weekend job) rather than reacting to metrics.
- **You may never need to.** For lists up to a few thousand items with reasonable insertion patterns, base or decimal mode (no buckets) is plenty.

### How buckets make rebalancing cheap

The three default buckets form a **ring**: `0 → 1 → 2 → 0`. Exactly one bucket is "live" at any time — every row sits in it, new inserts land in it. Rebalancing drains the live bucket into the next slot in the ring, handing each row a fresh short rank in the new space. After the migration, the old bucket is empty and waits its turn to be filled again, three rebalances from now.

At steady state every row shares the same bucket prefix, so the prefix contributes nothing to sorting — ordering runs purely on the value part. The prefix only matters **during** a migration, when rows are split across two buckets.

You can configure more than 3 buckets via `buckets` in the config, but 3 is Jira's convention and works well in practice.

### The migration-direction rule

Because bucket prefixes sort lexicographically (`"0" < "1" < "2"`), the direction you migrate rows in has to match whether the target bucket sorts higher or lower than the source:

- **`0 → 1` or `1 → 2`** (target sorts **above** source) → migrate **highest-ranked rows first**. Mid-flight, un-migrated lows are still in the old bucket, already-migrated highs are in the new bucket. `old|... < new|...`, so total order holds.
- **`2 → 0`** (target sorts **below** source — the wrap) → migrate **lowest-ranked rows first**. Mid-flight, already-migrated lows are in the new bucket, un-migrated highs are in the old bucket. `new|... < old|...`, so total order holds.

Pick the direction wrong and readers see reshuffled lists until the migration completes. Once it's done, all rows are back in a single bucket and sorting is trivial again.

### Recipe

```ts
// 1. Figure out the current and next buckets.
const currentBucket = await config.get("lexorank.activeBucket"); // e.g. "0"
const targetBucket = nextBucketAfter(currentBucket);              // e.g. "1"
const isWrap = targetBucket < currentBucket; // true only on 2 → 0

// 2. Read every row in the current bucket, ordered by rank.
const rows = await db.query(
  `SELECT id, rank FROM items WHERE rank LIKE '${currentBucket}|%' ORDER BY rank ASC`
);

// 3. Generate fresh, evenly-spaced ranks in the target bucket.
//    The library runs a recursive binary split so lengths stay logarithmic in N.
const R = createLexoRank({ bucket: true, activeBucket: currentBucket });
const fresh = R.evenlySpacedInBucket(targetBucket, rows.length);

// 4. Write back in the correct direction.
//    Forward migrations (0→1, 1→2): highest rank first.
//    Wrap migration (2→0): lowest rank first.
const writeOrder = isWrap ? rows : [...rows].reverse();
const rankOrder  = isWrap ? fresh : [...fresh].reverse();
for (let i = 0; i < writeOrder.length; i++) {
  await db.update(writeOrder[i].id, { rank: rankOrder[i].toString() });
}

// 5. Flip the live-bucket pointer so new inserts land in the target bucket.
await config.set("lexorank.activeBucket", targetBucket);
```

Two caveats the snippet glosses over:

- **Concurrent writes** during the migration should either be paused, or redirected to the target bucket (whichever your app can tolerate). The library gives you `activeBucket` to redirect `min`/`max`/`middle`/`evenlySpaced`, but coordination between the writer path and the migrator is your responsibility — typically a feature flag or a short lock while you flip the pointer.
- **Batch the writes** when `rows` is large. The loop above is a single pass for clarity; a real rebalancer pages through in chunks and commits per batch.

### The one impossible case

There's no string strictly between `"a"` and `"a0"`: any rank starting with `"a"` followed by more characters is already `>= "a0"` (or we'd need a character smaller than `"0"`, which doesn't exist). The library detects this upfront and throws a clear error rather than looping forever.

This only comes up when a rank with a trailing min character (like `"a0"`) is stored — which the library never generates on its own (results are always trimmed of trailing min chars). If you hit it:

1. **Widen the bracket.** Instead of `between(prev, next)`, compute `between(prevOfPrev, next)` or `between(prev, nextOfNext)` — pick a slightly larger gap that does have room.
2. **Regenerate the offending neighbour** with `genNext(prev)` or `genPrev(next)`. Neither will end in a min character.
3. **Rebalance.** Move the affected rows into the next bucket and regenerate their ranks from scratch.

## Examples generated by the lib

Each table shows repeated calls to `between(prev, next)`, feeding the result back in as the new `prev` so the range keeps narrowing toward `next`. Default alphabet is `BASE36`.

### Base

```ts
let prev = LexoRank.min(); // '1'
const next = LexoRank.max(); // 'y'
for (let i = 0; i < 6; i++) prev = LexoRank.between(prev, next);
```

| prev | next | inserted |
| ---- | ---- | -------- |
| `1`  | `y`  | `h`      |
| `h`  | `y`  | `p`      |
| `p`  | `y`  | `t`      |
| `t`  | `y`  | `v`      |
| `v`  | `y`  | `w`      |
| `w`  | `y`  | `x`      |

### Bucket

Bucket prefix is preserved across `between`; `inBucket` moves the whole rank sideways into any named bucket.

| prev   | next   | inserted |
| ------ | ------ | -------- |
| `0\|1` | `0\|y` | `0\|h`   |
| `0\|h` | `0\|y` | `0\|p`   |
| `0\|p` | `0\|y` | `0\|t`   |
| `0\|t` | `0\|y` | `0\|v`   |
| `0\|v` | `0\|y` | `0\|w`   |

```ts
const r = LexoBucketRank.middle(); // '0|i'
r.inBucket("1").toString(); // '1|i'
r.inBucket("2").toString(); // '2|i'
```

### Decimal

Examples below use `integerWidth: 1` so the tail-growth behaviour is easy to see. While integer space has room, new ranks pick an integer midpoint and leave the decimal empty:

| prev | next | inserted |
| ---- | ---- | -------- |
| `a:` | `z:` | `m:`     |
| `a:` | `m:` | `g:`     |
| `a:` | `g:` | `d:`     |

Once the integers are adjacent (no integer midpoint possible), the decimal tail takes over and grows:

| prev    | next | inserted |
| ------- | ---- | -------- |
| `x:`    | `y:` | `x:i`    |
| `x:i`   | `y:` | `x:ii`   |
| `x:ii`  | `y:` | `x:iii`  |
| `x:iii` | `y:` | `x:iiii` |

Within the same integer, two non-empty decimals get a plain midpoint in the tail:

| prev  | next  | inserted |
| ----- | ----- | -------- |
| `m:a` | `m:z` | `m:m`    |
| `m:a` | `m:m` | `m:g`    |
| `m:a` | `m:g` | `m:d`    |

### Bucket + Decimal

Same behaviour as Decimal, with the bucket prefix riding along. `integerWidth: 2` here so the fixed-width integer is clearer:

| prev     | next     | inserted |
| -------- | -------- | -------- |
| `0\|01:` | `0\|zy:` | `0\|hz:` |
| `0\|hz:` | `0\|zy:` | `0\|qy:` |
| `0\|qy:` | `0\|zy:` | `0\|vg:` |
| `0\|vg:` | `0\|zy:` | `0\|xp:` |
| `0\|xp:` | `0\|zy:` | `0\|yt:` |
| `0\|yt:` | `0\|zy:` | `0\|zd:` |

## Development

```sh
npm install
npm test            # vitest run
npm run test:coverage
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --write
npm run build       # tsup → dist/
npm run smoke       # verify built dist/ exports (run after build)
```

## License

MIT

"LexoRank" is a term coined by Asana/Jira. Open an issue if the repo or the license require some changes, I will fix it ASAP.
