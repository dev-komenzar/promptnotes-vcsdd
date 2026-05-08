// app-startup/hydrate-feed.ts
// Step 3: Hydrate Feed and TagInventory from a ScannedVault.
//
// REQ-008: hydrateFeed is a pure function — no ports, no async, unary.
// REQ-009: Partial-failure vault succeeds; corrupted files excluded from Feed.
// REQ-015 AC-1: hydrateFeed has no port dependencies.
// PROP-001: pure — same ScannedVault input → identical HydratedFeed.
// PROP-002: hydrateFeed excludes all corrupted-file entries from Feed.noteRefs.
// PROP-015: Feed sort order is updatedAt descending.
// PROP-027: HydrateNote purity enables hydrateFeed purity.
// PROP-030: parseMarkdownToBlocks called exactly twice per non-corrupt file:
//   once in Step 2 (via ScanVaultPorts, result discarded) and once here via hydrateNote.
//   scannedVault.parseMarkdownToBlocks carries the injected reference so both
//   invocations use the same function.
// PROP-032: If hydrateNote returns Err for any snapshot during Step 3, hydrateFeed MUST throw.
//   This indicates a Step 2/Step 3 divergence (invariant violation), not a recoverable file error.
//   Step-2 corruptedFiles pass through unchanged — they are NOT augmented by Step-3 failures.

import type { NoteId, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot, CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagEntry, TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { HydratedFeed, ScannedVault } from "./stages.js";
import { hydrateNote } from "./hydrate-note.js";

/**
 * Step 3 of the AppStartup pipeline — pure transformation.
 *
 * Function arity is 1 (verified by test: hydrateFeed.length === 1).
 * No clock, no filesystem, no allocator. Output is fully determined by input.
 *
 * PROP-001: referentially transparent — deterministic for any fixed input.
 * lastBuiltAt is set to epochMillis: 0 to avoid Date.now() impurity.
 *
 * PROP-030: calls hydrateNote per snapshot using scannedVault.parseMarkdownToBlocks
 * (the same function reference used in Step 2), satisfying the two-call budget.
 *
 * PROP-032: If hydrateNote returns Err for any snapshot during Step 3, hydrateFeed throws.
 * This is an invariant violation (Step 2 passed the file, Step 3 cannot re-parse it) —
 * it is NOT a recoverable per-file error. Step-2 corruptedFiles pass through unchanged.
 */
export function hydrateFeed(scannedVault: ScannedVault): HydratedFeed {
  const { snapshots, corruptedFiles: step2CorruptedFiles } = scannedVault;

  // PROP-030: use the same parseMarkdownToBlocks that was injected in Step 2
  // (carried on scannedVault) so call-count tracking works correctly.
  const blockParser = scannedVault.parseMarkdownToBlocks;

  const hydratedSnapshots: NoteFileSnapshot[] = [];

  for (const snapshot of snapshots) {
    // PROP-027: hydrateNote is pure — same snapshot always produces same Result.
    const noteResult = blockParser !== undefined
      ? hydrateNote(snapshot, blockParser)
      : hydrateNote(snapshot);

    if (!noteResult.ok) {
      // PROP-032: Step-3 hydrateNote failure is an invariant violation, not a file error.
      // The file passed Step 2 validation but cannot be re-parsed in Step 3 — divergence.
      throw new Error(
        `hydrateNote-invariant-violation: ${snapshot.filePath}: ${noteResult.error}`
      );
    }

    hydratedSnapshots.push(snapshot);
  }

  // PROP-015: sort noteRefs by updatedAt descending (stable copy, no mutation).
  const sorted = [...hydratedSnapshots].sort(
    (a, b) =>
      (b.frontmatter.updatedAt.epochMillis as unknown as number) -
      (a.frontmatter.updatedAt.epochMillis as unknown as number)
  );

  const noteRefs: readonly NoteId[] = sorted.map((s) => s.noteId);

  const feed: Feed = {
    noteRefs,
    filterCriteria: {
      tags: [],
      frontmatterFields: new Map<string, string>(),
    },
    searchQuery: null,
    sortOrder: { field: "timestamp", direction: "desc" },
  };

  // Build TagInventory from successfully hydrated snapshots only.
  // PROP-001: lastBuiltAt fixed to epochMillis: 0 (deterministic, no Date.now()).
  const tagInventory = buildTagInventory(hydratedSnapshots);

  // PROP-032: Step-2 corruptedFiles pass through unchanged (no Step-3 augmentation).
  return {
    kind: "HydratedFeed",
    feed,
    tagInventory,
    corruptedFiles: step2CorruptedFiles,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Aggregate tags from all hydrated snapshots.
 * Each unique tag gets a TagEntry with its total usage count.
 * Deterministic: sorted by tag string for stable output.
 */
function buildTagInventory(snapshots: readonly NoteFileSnapshot[]): TagInventory {
  const counts = new Map<string, number>();

  for (const snapshot of snapshots) {
    const tags = snapshot.frontmatter.tags as unknown as readonly Tag[];
    for (const tag of tags) {
      const key = tag as unknown as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  // Sort by tag string for deterministic ordering (PROP-001).
  const entries: TagEntry[] = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, usageCount]) => ({
      name: name as unknown as Tag,
      usageCount,
    }));

  return {
    entries,
    // PROP-001: epochMillis: 0 — no Date.now() call preserves purity.
    lastBuiltAt: { epochMillis: 0 } as unknown as Timestamp,
  };
}
