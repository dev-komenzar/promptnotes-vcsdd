/**
 * tagInventory.ts — Pure tag inventory computation from noteMetadata.
 *
 * REQ-TAG-014, REQ-TAG-018
 * Pure function. No I/O, no side effects.
 *
 * Computes TagEntry[] (tags with usageCount) from noteMetadata.
 * - Each entry has usageCount > 0 (unused tags excluded)
 * - Entries unique by name
 * - Sorted by usageCount descending
 */

import type { NoteRowMetadata } from './types.js';

export type TagEntry = {
  readonly name: string;
  readonly usageCount: number;
};

/**
 * Compute tag inventory from per-note metadata.
 * Pure: deterministic, no side effects.
 *
 * @param noteMetadata - Record of noteId → NoteRowMetadata
 * @returns TagEntry[] sorted by usageCount descending, usageCount > 0 only
 */
export function tagInventoryFromMetadata(
  noteMetadata: Readonly<Record<string, NoteRowMetadata>>,
): readonly TagEntry[] {
  const counts = new Map<string, number>();

  for (const noteId of Object.keys(noteMetadata)) {
    const meta = noteMetadata[noteId];
    if (!meta) continue;
    for (const tag of meta.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const entries: TagEntry[] = [];
  for (const [name, usageCount] of counts) {
    if (usageCount > 0) {
      entries.push({ name, usageCount });
    }
  }

  entries.sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return a.name.localeCompare(b.name);
  });

  return entries;
}
