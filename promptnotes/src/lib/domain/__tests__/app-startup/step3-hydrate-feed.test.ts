/**
 * step3-hydrate-feed.test.ts — Step 3: hydrateFeed tests
 *
 * REQ-008: hydrateFeed is a pure function
 * REQ-009: Partial-failure vault succeeds (corrupted files excluded from Feed)
 * REQ-015: AC-1 — hydrateFeed (Step 3) has no port dependencies and is pure
 *
 * PROP-001: hydrateFeed is pure — same ScannedVault input → identical HydratedFeed (required: true)
 * PROP-002: hydrateFeed excludes all corrupted-file entries from Feed.noteRefs (required: true)
 * PROP-015: Feed sort order is updatedAt descending
 * PROP-018: total output invariant (covered in step2, but hydrateFeed passes corruptedFiles through)
 * PROP-023: Clock.now() not called inside hydrateFeed (Sprint 2)
 *
 * Sprint 2 changes:
 *   PROP-023b: type-level assertion — hydrateFeed signature has no Timestamp parameter
 *   PROP-023c: runtime — hydrateFeed produces deterministic output without any clock dependency
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteFileSnapshot, CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { NoteId, Timestamp, VaultPath, Body, Frontmatter, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { ScannedVault, HydratedFeed } from "$lib/domain/app-startup/stages";

// The implementation does NOT exist yet. This import will fail in Red phase.
import { hydrateFeed } from "$lib/domain/app-startup/hydrate-feed";

// ── PROP-023b / REQ-015 AC-4: Type-level signature assertion ─────────────
//
// REQ-015 AC-4: hydrateFeed accepts only ScannedVault as its parameter.
// A Timestamp parameter must NOT be allowed.
//
// Type-level check: Parameters<typeof hydrateFeed> must be a 1-tuple `[ScannedVault]`.
// A Timestamp has `{ epochMillis: number }` shape. Verify that the first (and only)
// parameter does NOT extend { epochMillis: number }.

type _HydrateFeedSig = Parameters<typeof hydrateFeed>;

// FIND-011 background: the prior guard `const _noTimestamp: _NoTimestampParam = undefined as never`
// was tautological because `undefined as never` is assignable to any target, including a
// non-`never` Extract result. The strengthened guards below replace it with assertions that
// fail compile when the impl gains a Timestamp parameter or widens the parameter tuple.

type _IsNever<T> = [T] extends [never] ? true : false;

// PROP-023b (FIND-011 strengthened guard #1 — arity): the parameter tuple must have arity 1.
// If hydrateFeed gains a second `now: Timestamp` parameter, `_HydrateFeedSig['length']`
// becomes `2`, and the assignment `2 = 1 as const` fails compile.
const _hydrateFeedArity: _HydrateFeedSig["length"] = 1 as const;
void _hydrateFeedArity;

// PROP-023b (FIND-011 strengthened guard #2 — exact tuple shape): the parameter tuple must
// be exactly `[ScannedVault]`. Tuple `extends` is length-sensitive: `[ScannedVault, Timestamp]
// extends [ScannedVault]` is `false`, so `_IsExactlyOneScannedVaultArg` becomes `false`, and
// the assignment `true = false` fails compile.
type _IsExactlyOneScannedVaultArg = _HydrateFeedSig extends [ScannedVault] ? true : false;
const _exactlyOneScannedVaultArg: _IsExactlyOneScannedVaultArg = true;
void _exactlyOneScannedVaultArg;

// PROP-023b (FIND-011 strengthened guard #3 — no Timestamp anywhere): no tuple element
// may extend `{ epochMillis: number }` (the Timestamp shape). If any element does, the
// Extract is non-never and `_IsNever<...>` becomes `false`, breaking compile.
type _NoTimestampParam = Extract<_HydrateFeedSig[number], { epochMillis: number }>;
const _noTimestampParamAnywhere: _IsNever<_NoTimestampParam> = true;
void _noTimestampParamAnywhere;

// ── Test helpers ──────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeFrontmatter(createdMs: number, updatedMs: number, tags: Tag[] = []): Frontmatter {
  return {
    tags,
    createdAt: makeTimestamp(createdMs),
    updatedAt: makeTimestamp(updatedMs),
  } as unknown as Frontmatter;
}

function makeSnapshot(
  noteId: string,
  filePath: string,
  updatedMs: number,
  createdMs = 1000
): NoteFileSnapshot {
  return {
    noteId: makeNoteId(noteId),
    body: makeBody("body"),
    frontmatter: makeFrontmatter(createdMs, updatedMs),
    filePath,
    fileMtime: makeTimestamp(updatedMs),
  };
}

function makeScannedVault(
  snapshots: NoteFileSnapshot[],
  corruptedFiles: CorruptedFile[] = []
): ScannedVault {
  return {
    kind: "ScannedVault",
    snapshots,
    corruptedFiles,
  } as unknown as ScannedVault;
}

function makeCorruptedFile(filePath: string): CorruptedFile {
  return {
    filePath,
    failure: { kind: "read", fsError: { kind: "permission" } },
  };
}

// ── REQ-008 / PROP-001: purity ────────────────────────────────────────────

describe("REQ-008 / PROP-001: hydrateFeed is pure (required)", () => {
  test("same ScannedVault input always produces identical HydratedFeed", () => {
    // PROP-001: ∀ input, hydrateFeed(input) deepEquals hydrateFeed(input)
    const snapshot = makeSnapshot("2026-04-28-120000-001", "/vault/a.md", 2000);
    const input = makeScannedVault([snapshot]);

    const result1 = hydrateFeed(input);
    const result2 = hydrateFeed(input);

    // Deep structural equality — same NoteIds in same order
    expect(result1.feed.noteRefs).toEqual(result2.feed.noteRefs);
    expect(result1.tagInventory.entries).toEqual(result2.tagInventory.entries);
    expect(result1.corruptedFiles).toEqual(result2.corruptedFiles);
  });

  test("PROP-001 property: ∀ ScannedVault input, fn(input) equals fn(input)", () => {
    // Tier 1 fast-check property for referential transparency.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            noteId: fc.string({ minLength: 20, maxLength: 25 }).map((s) => makeNoteId(s)),
            filePath: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/vault/${s}.md`),
            updatedMs: fc.integer({ min: 1000, max: 9999999 }),
          }),
          { minLength: 0, maxLength: 8 }
        ),
        (snapshotDefs) => {
          // Deduplicate noteIds
          const seen = new Set<string>();
          const snapshots: NoteFileSnapshot[] = snapshotDefs
            .filter((s) => {
              const key = s.noteId as unknown as string;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map((s) =>
              makeSnapshot(
                s.noteId as unknown as string,
                s.filePath,
                s.updatedMs
              )
            );

          const scannedVault = makeScannedVault(snapshots);
          const result1 = hydrateFeed(scannedVault);
          const result2 = hydrateFeed(scannedVault);

          // Referential transparency: same output for same input
          const r1Ids = [...result1.feed.noteRefs].map((id) => id as unknown as string).join(",");
          const r2Ids = [...result2.feed.noteRefs].map((id) => id as unknown as string).join(",");
          return r1Ids === r2Ids;
        }
      )
    );
  });

  test("REQ-008 AC: hydrateFeed takes only ScannedVault — function arity is 1", () => {
    // hydrateFeed must be a unary function (ScannedVault) => HydratedFeed.
    // No Settings, FileSystem, Clock, or allocateNoteId ports.
    expect(hydrateFeed.length).toBe(1);
  });

  test("REQ-008 AC: corruptedFiles from ScannedVault passed through unchanged", () => {
    // The corruptedFiles from Step 2 must appear unchanged in HydratedFeed.
    const corrupted = makeCorruptedFile("/vault/bad.md");
    const input = makeScannedVault([], [corrupted]);

    const result = hydrateFeed(input);

    expect(result.corruptedFiles).toHaveLength(1);
    expect(result.corruptedFiles[0]).toEqual(corrupted);
  });
});

// ── PROP-023b / PROP-023c / REQ-015 AC-1/AC-4: hydrateFeed has no clock ─

describe("PROP-023b / PROP-023c / REQ-015: hydrateFeed has no Clock.now dependency", () => {
  test("PROP-023b: hydrateFeed signature has exactly 1 parameter (ScannedVault only, no Timestamp)", () => {
    // REQ-015 AC-4: hydrateFeed accepts only ScannedVault; no Timestamp argument.
    // Runtime check: function arity must be 1.
    // Type-level check is encoded at file top (_NoTimestampParam).
    expect(hydrateFeed.length).toBe(1);
  });

  test("PROP-023b: type-level — hydrateFeed parameter does not have epochMillis shape", () => {
    // REQ-015 AC-4: The parameter type of hydrateFeed must NOT have `epochMillis`.
    // This is a runtime proxy for the compile-time assertion at file top.
    // The type assertion `_noTimestamp: _NoTimestampParam = undefined as never` would
    // fail to compile if hydrateFeed's first param were Timestamp.
    // Runtime: verify arity is 1, which is the only observable proxy.
    // (TypeScript type checking provides the deeper guarantee.)
    expect(hydrateFeed.length).toBe(1);
    // Verify that calling hydrateFeed with only ScannedVault works (no second arg needed):
    const input = makeScannedVault([]);
    const result = hydrateFeed(input); // must not require a second argument
    expect(result.kind).toBe("HydratedFeed");
  });

  test("PROP-023c: hydrateFeed produces identical output across two calls — no Date.now contamination", () => {
    // PROP-023c: hydrateFeed is deterministic; it must not call Date.now() internally.
    // If it called Date.now(), two calls with the same input could differ (different timestamps).
    // We spy on Date.now to detect any call from inside hydrateFeed.
    const snapshot = makeSnapshot("2026-04-28-120000-001", "/vault/a.md", 2000);
    const input = makeScannedVault([snapshot]);

    // Patch Date.now to track calls during hydrateFeed execution.
    const originalDateNow = Date.now;
    let dateNowCallCount = 0;
    Date.now = () => {
      dateNowCallCount++;
      return originalDateNow();
    };

    try {
      const result1 = hydrateFeed(input);
      const result2 = hydrateFeed(input);

      // PROP-023c: Date.now must NOT be called inside hydrateFeed (0 calls).
      // If hydrateFeed calls Date.now, dateNowCallCount > 0.
      expect(dateNowCallCount).toBe(0);

      // Also verify outputs are identical (purity confirmation):
      const r1Ids = [...result1.feed.noteRefs].map((id) => id as unknown as string).join(",");
      const r2Ids = [...result2.feed.noteRefs].map((id) => id as unknown as string).join(",");
      expect(r1Ids).toBe(r2Ids);
    } finally {
      // Restore original Date.now regardless of test outcome.
      Date.now = originalDateNow;
    }
  });

  test("PROP-023c: hydrateFeed.lastBuiltAt is deterministic (epochMillis: 0, not Date.now)", () => {
    // PROP-001 / PROP-023c: The tagInventory.lastBuiltAt must be deterministic.
    // Current impl uses epochMillis: 0 — verify it does NOT use Date.now().
    const input = makeScannedVault([]);
    const result = hydrateFeed(input);

    // lastBuiltAt must be a fixed value (0 or similar) — not current wall clock.
    const lastBuiltAtMs = (result.tagInventory.lastBuiltAt as unknown as { epochMillis: number }).epochMillis;
    // The value must be deterministic. We check it's the same across calls.
    const result2 = hydrateFeed(input);
    const lastBuiltAtMs2 = (result2.tagInventory.lastBuiltAt as unknown as { epochMillis: number }).epochMillis;
    expect(lastBuiltAtMs).toBe(lastBuiltAtMs2);

    // Specifically: it must NOT be a near-current timestamp (which would indicate Date.now).
    const nowMs = Date.now();
    // If lastBuiltAt were Date.now(), it would be within 1000ms of nowMs.
    // A deterministic value like 0 would be far from nowMs (at least several years old).
    const isNotCurrentTime = Math.abs(lastBuiltAtMs - nowMs) > 1_000;
    expect(isNotCurrentTime).toBe(true);
  });
});

// ── REQ-009 / PROP-002: corrupted files excluded from Feed ────────────────

describe("REQ-009 / PROP-002: corrupted files excluded from Feed.noteRefs (required)", () => {
  test("PROP-002: corruptedFiles ∩ noteRefs = ∅ (empty intersection)", () => {
    // REQ-009 AC: Feed.noteRefs does NOT contain NoteIds from corruptedFiles.
    const goodSnapshot = makeSnapshot("2026-04-28-120000-001", "/vault/good.md", 2000);
    const corrupted = makeCorruptedFile("/vault/bad.md");

    // The corrupted file has a different path — its NoteId is not in snapshots.
    // If scanVault is correct, corruptedFiles.filePath never appears as a snapshot.
    const input = makeScannedVault([goodSnapshot], [corrupted]);

    const result = hydrateFeed(input);

    // /vault/bad.md is NOT in noteRefs
    const noteRefStrings = result.feed.noteRefs.map((id) => id as unknown as string);
    // REQ-009: the corrupted file path should not correspond to any noteRef
    expect(noteRefStrings).not.toContain("/vault/bad.md");
    // The good snapshot IS in noteRefs
    expect(noteRefStrings).toContain("2026-04-28-120000-001");
  });

  test("PROP-002 property: ∀ (snapshots, corruptedFiles), noteRefs ⊆ snapshot NoteIds", () => {
    // Tier 1 property: every noteRef in the feed corresponds to an input snapshot.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            noteIdStr: fc.string({ minLength: 20, maxLength: 25 }),
            updatedMs: fc.integer({ min: 1000, max: 9999999 }),
          }),
          { minLength: 0, maxLength: 8 }
        ),
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map((s) => `/vault/corrupt-${s}.md`),
          { minLength: 0, maxLength: 4 }
        ),
        (snapshotDefs, corruptedPaths) => {
          const seen = new Set<string>();
          const snapshots: NoteFileSnapshot[] = snapshotDefs
            .filter((s) => {
              if (seen.has(s.noteIdStr)) return false;
              seen.add(s.noteIdStr);
              return true;
            })
            .map((s) =>
              makeSnapshot(s.noteIdStr, `/vault/${s.noteIdStr}.md`, s.updatedMs)
            );

          const corruptedFiles: CorruptedFile[] = corruptedPaths.map(makeCorruptedFile);
          const inputSnapshotIds = new Set(
            snapshots.map((s) => s.noteId as unknown as string)
          );

          const result = hydrateFeed(makeScannedVault(snapshots, corruptedFiles));

          // Every noteRef must come from the input snapshots
          for (const ref of result.feed.noteRefs) {
            if (!inputSnapshotIds.has(ref as unknown as string)) return false;
          }
          return true;
        }
      )
    );
  });

  test("all-corrupted vault → empty Feed.noteRefs", () => {
    // REQ-009 AC: When all files are corrupted, Feed is empty.
    const corrupted1 = makeCorruptedFile("/vault/a.md");
    const corrupted2 = makeCorruptedFile("/vault/b.md");
    const input = makeScannedVault([], [corrupted1, corrupted2]);

    const result = hydrateFeed(input);

    expect(result.feed.noteRefs).toHaveLength(0);
    expect(result.corruptedFiles).toHaveLength(2);
  });

  test("REQ-009: TagInventory does not include tags from corrupted files", () => {
    // REQ-009 AC: TagInventory does NOT include tags from corrupted files.
    // Corrupted files never reach the parser, so their tags are never in TagInventory.
    const corrupted = makeCorruptedFile("/vault/bad.md");
    const input = makeScannedVault([], [corrupted]);

    const result = hydrateFeed(input);

    // TagInventory should have no entries (no successfully hydrated notes with tags).
    expect(result.tagInventory.entries).toHaveLength(0);
  });
});

// ── REQ-008 / PROP-015: Feed sort order ──────────────────────────────────

describe("REQ-008 / PROP-015: Feed.noteRefs sorted by updatedAt descending", () => {
  test("3 snapshots sorted desc by updatedAt", () => {
    // REQ-008 AC: Feed sort order is updatedAt descending (source: aggregates.md §2 Feed).
    const s1 = makeSnapshot("id-1", "/vault/a.md", 1000); // oldest
    const s2 = makeSnapshot("id-2", "/vault/b.md", 3000); // newest
    const s3 = makeSnapshot("id-3", "/vault/c.md", 2000); // middle

    const input = makeScannedVault([s1, s2, s3]);

    const result = hydrateFeed(input);

    const ids = result.feed.noteRefs.map((id) => id as unknown as string);
    // Expected order: id-2 (3000) > id-3 (2000) > id-1 (1000)
    expect(ids[0]).toBe("id-2");
    expect(ids[1]).toBe("id-3");
    expect(ids[2]).toBe("id-1");
  });

  test("PROP-015 property: ∀ non-empty snapshots, noteRefs sorted desc by updatedAt", () => {
    // Tier 1 fast-check property for sort order.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            noteIdSuffix: fc.nat({ max: 9999 }).map((n) => String(n).padStart(4, "0")),
            updatedMs: fc.integer({ min: 1000, max: 9999999 }),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (snapshotDefs) => {
          const seen = new Set<string>();
          const snapshots: NoteFileSnapshot[] = snapshotDefs
            .filter((s) => {
              if (seen.has(s.noteIdSuffix)) return false;
              seen.add(s.noteIdSuffix);
              return true;
            })
            .map((s) => makeSnapshot(`id-${s.noteIdSuffix}`, `/vault/${s.noteIdSuffix}.md`, s.updatedMs));

          if (snapshots.length === 0) return true;

          const result = hydrateFeed(makeScannedVault(snapshots));

          // Verify descending order by updatedAt
          const noteRefIds = result.feed.noteRefs.map((id) => id as unknown as string);
          const snapshotMap = new Map(
            snapshots.map((s) => [s.noteId as unknown as string, s.frontmatter.updatedAt.epochMillis as unknown as number])
          );

          for (let i = 0; i < noteRefIds.length - 1; i++) {
            const currMs = snapshotMap.get(noteRefIds[i]) ?? 0;
            const nextMs = snapshotMap.get(noteRefIds[i + 1]) ?? 0;
            if (currMs < nextMs) return false;
          }
          return true;
        }
      )
    );
  });

  test("empty snapshots → empty noteRefs (sort of empty is empty)", () => {
    const input = makeScannedVault([]);
    const result = hydrateFeed(input);
    expect(result.feed.noteRefs).toHaveLength(0);
  });
});

// ── REQ-008: HydratedFeed shape ───────────────────────────────────────────

describe("REQ-008: HydratedFeed shape", () => {
  test("HydratedFeed has kind, feed, tagInventory, corruptedFiles", () => {
    const input = makeScannedVault([]);
    const result = hydrateFeed(input);

    expect(result.kind).toBe("HydratedFeed");
    expect("feed" in result).toBe(true);
    expect("tagInventory" in result).toBe(true);
    expect("corruptedFiles" in result).toBe(true);
  });

  test("TagInventory is built from hydrated notes via TagInventory.buildFromNotes", () => {
    // REQ-008 AC: TagInventory built from hydrated Note snapshots.
    const taggedSnapshot = makeSnapshot(
      "id-tagged",
      "/vault/tagged.md",
      2000,
      1000
    );
    // Re-create with tags
    const taggedSnapshotWithTags: NoteFileSnapshot = {
      ...taggedSnapshot,
      frontmatter: makeFrontmatter(1000, 2000, [makeTag("rust")]),
    };

    const input = makeScannedVault([taggedSnapshotWithTags]);
    const result = hydrateFeed(input);

    // TagInventory should contain 'rust' tag with usageCount=1
    const rustEntry = result.tagInventory.entries.find(
      (e) => (e.name as unknown as string) === "rust"
    );
    expect(rustEntry).toBeDefined();
    if (rustEntry) {
      expect(rustEntry.usageCount).toBe(1);
    }
  });
});
