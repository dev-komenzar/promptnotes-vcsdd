// app-startup/hydrate-feed.ts
// Step 3: Hydrate Feed and TagInventory from a ScannedVault.
//
// REQ-008: hydrateFeed is a pure function — no ports, no async, unary.
// REQ-009: Partial-failure vault succeeds; corrupted files excluded from Feed.
// REQ-015 AC-1: hydrateFeed has no port dependencies.
// PROP-001: pure — same ScannedVault input → identical HydratedFeed.
// PROP-002: hydrateFeed excludes all corrupted-file entries from Feed.noteRefs.
// PROP-015: Feed sort order is updatedAt descending.

import type { NoteId, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagEntry, TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { HydratedFeed, ScannedVault } from "./stages.js";

/**
 * Step 3 of the AppStartup pipeline — pure transformation.
 *
 * Function arity is 1 (verified by test: hydrateFeed.length === 1).
 * No clock, no filesystem, no allocator. Output is fully determined by input.
 *
 * PROP-001: referentially transparent — deterministic for any fixed input.
 * lastBuiltAt is set to epochMillis: 0 to avoid Date.now() impurity.
 */
export function hydrateFeed(scannedVault: ScannedVault): HydratedFeed {
  const { snapshots, corruptedFiles } = scannedVault;

  // PROP-015: sort noteRefs by updatedAt descending (stable copy, no mutation).
  const sorted = [...snapshots].sort(
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
  const tagInventory = buildTagInventory(snapshots);

  return {
    kind: "HydratedFeed",
    feed,
    tagInventory,
    corruptedFiles,
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
