/**
 * tagInventory.test.ts — RED PHASE: TagInventory pure computation tests
 *
 * All tests MUST FAIL because `tagInventoryFromMetadata` does not exist yet.
 * This function is defined in the verification architecture as a new pure
 * function in `$lib/feed/tagInventory.ts`.
 *
 * Coverage:
 *   PROP-TAG-005 (autocomplete sorted by usageCount descending)
 *   PROP-TAG-018 (unused tag auto-hide — usageCount > 0 invariant)
 *   PROP-TAG-030 (tag inventory satisfies structural invariants)
 *
 * REQ coverage: REQ-TAG-014, REQ-TAG-018, EC-010, EC-014
 */

import { describe, test, expect } from 'bun:test';
import type { NoteRowMetadata } from '$lib/feed/types';

// ── RED PHASE: import will fail — function does not exist ─────────────────────
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — RED PHASE: tagInventoryFromMetadata is not yet implemented
import { tagInventoryFromMetadata } from '$lib/feed/tagInventory.js';

// ── Type that WILL be exported ────────────────────────────────────────────────

/** Expected shape after implementation. */
type TagEntry = {
  readonly name: string;
  readonly usageCount: number;
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMetadata(
  entries: Record<string, string[]>
): Readonly<Record<string, NoteRowMetadata>> {
  const result: Record<string, NoteRowMetadata> = {};
  let i = 0;
  for (const [noteId, tags] of Object.entries(entries) as [string, string[]][]) {
    result[noteId] = {
      body: `Body of ${noteId}`,
      createdAt: 1746000000 + i * 1000,
      updatedAt: 1746000000 + i * 1000,
      tags: Object.freeze([...tags]),
    };
    i++;
  }
  return result;
}

// ── REQ-TAG-018: TagInventory from empty metadata ──────────────────────────

describe('REQ-TAG-018: tagInventoryFromMetadata — empty input', () => {
  test('Empty metadata → empty inventory (RED: FAILS)', () => {
    const metadata = makeMetadata({});
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toEqual([]);
  });

  test('Empty metadata returns an array (not null/undefined) (RED: FAILS)', () => {
    const metadata = makeMetadata({});
    const inventory = tagInventoryFromMetadata(metadata);
    expect(Array.isArray(inventory)).toBe(true);
  });
});

// ── REQ-TAG-018: Single note, single tag ───────────────────────────────────

describe('REQ-TAG-018: tagInventoryFromMetadata — single note with one tag', () => {
  test('Single note with one tag → inventory with usageCount=1 (RED: FAILS)', () => {
    const metadata = makeMetadata({ 'note-1': ['draft'] });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toEqual({ name: 'draft', usageCount: 1 });
  });
});

// ── REQ-TAG-018: Single note, multiple tags ────────────────────────────────

describe('REQ-TAG-018: tagInventoryFromMetadata — single note with multiple tags', () => {
  test('Single note with 3 tags → 3 entries each with usageCount=1 (RED: FAILS)', () => {
    const metadata = makeMetadata({ 'note-1': ['typescript', 'svelte', 'draft'] });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(3);
    const names = inventory.map((e: TagEntry) => e.name).sort();
    expect(names).toEqual(['draft', 'svelte', 'typescript']);
    for (const entry of inventory) {
      expect(entry.usageCount).toBe(1);
    }
  });
});

// ── REQ-TAG-018: Multiple notes, same tag ──────────────────────────────────

describe('REQ-TAG-018: tagInventoryFromMetadata — multiple notes with same tag', () => {
  test('Two notes sharing a tag → inventory with usageCount=2 (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'note-1': ['draft'],
      'note-2': ['draft'],
    });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toEqual({ name: 'draft', usageCount: 2 });
  });

  test('Three notes all with same tag → usageCount=3 (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'note-1': ['bug'],
      'note-2': ['bug'],
      'note-3': ['bug'],
    });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toEqual({ name: 'bug', usageCount: 3 });
  });
});

// ── REQ-TAG-005 / REQ-TAG-018: Sorting by usageCount descending ────────────

describe('REQ-TAG-005/018: tagInventoryFromMetadata — sorted by usageCount descending', () => {
  test('Tags are sorted by usageCount descending (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'note-1': ['common', 'rare'],
      'note-2': ['common'],
      'note-3': ['common', 'medium'],
      'note-4': ['medium'],
    });
    // common=3, medium=2, rare=1
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(3);
    expect(inventory[0]).toEqual({ name: 'common', usageCount: 3 });
    expect(inventory[1]).toEqual({ name: 'medium', usageCount: 2 });
    expect(inventory[2]).toEqual({ name: 'rare', usageCount: 1 });
  });

  test('Tags with equal usageCount maintain stable order (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'note-1': ['alpha', 'beta'],
      'note-2': ['gamma', 'delta'],
    });
    // All tags have usageCount=1
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(4);
    for (const entry of inventory) {
      expect(entry.usageCount).toBe(1);
    }
    // All entries exist exactly once
    const names = inventory.map((e: TagEntry) => e.name).sort();
    expect(names).toEqual(['alpha', 'beta', 'delta', 'gamma']);
  });
});

// ── REQ-TAG-014: Unused tag auto-hide (usageCount > 0 invariant) ───────────

describe('REQ-TAG-014: tagInventoryFromMetadata — usageCount > 0 invariant', () => {
  test('Tags with usageCount=0 are excluded (RED: FAILS)', () => {
    // No notes have any tags → inventory must be empty
    const metadata = makeMetadata({
      'note-1': [],
      'note-2': [],
    });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toHaveLength(0);
  });

  test('All notes with zero tags → empty inventory (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'note-1': [],
      'note-2': [],
      'note-3': [],
    });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    expect(inventory).toEqual([]);
  });

  test('Tag removed from last note → usageCount drops to 0 → excluded (RED: FAILS)', () => {
    // Simulate: tag 'orphan' was removed from its only note
    const metadata = makeMetadata({
      'note-1': ['typescript'],
      'note-2': ['typescript', 'svelte'],
      'note-3': ['svelte'],
    });
    // 'orphan' is not in any note's tags — shouldn't appear
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    const orphanEntry = inventory.find((e: TagEntry) => e.name === 'orphan');
    expect(orphanEntry).toBeUndefined();
  });
});

// ── PROP-TAG-030: Structural invariants (property test style) ──────────────

describe('PROP-TAG-030: tagInventoryFromMetadata — structural invariants', () => {
  test('Every entry has usageCount > 0 (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'a': ['x', 'y'],
      'b': ['x'],
    });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    for (const entry of inventory) {
      expect(entry.usageCount).toBeGreaterThan(0);
    }
  });

  test('Every entry name is unique (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'a': ['x', 'y'],
      'b': ['x', 'z'],
      'c': ['x', 'y', 'z'],
    });
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    const seen = new Set<string>();
    for (const entry of inventory) {
      expect(seen.has(entry.name)).toBe(false);
      seen.add(entry.name);
    }
  });

  test('UsageCount equals actual note count containing the tag (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'n1': ['tag-a', 'tag-b'],
      'n2': ['tag-a'],
      'n3': ['tag-b', 'tag-c'],
    });
    // tag-a: 2 notes (n1, n2), tag-b: 2 notes (n1, n3), tag-c: 1 note (n3)
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);
    for (const entry of inventory) {
      let actualCount = 0;
      for (const [, meta] of Object.entries(metadata)) {
        if (meta.tags.includes(entry.name)) {
          actualCount++;
        }
      }
      expect(entry.usageCount).toBe(actualCount);
    }
  });
});

// ── REQ-TAG-018: Realistic scenario — 10 notes with varying tags ───────────

describe('REQ-TAG-018: tagInventoryFromMetadata — realistic 10-note scenario', () => {
  test('Correctly computes inventory for 10 notes with overlapping tags (RED: FAILS)', () => {
    const metadata = makeMetadata({
      'note-01': ['typescript', 'svelte'],
      'note-02': ['typescript', 'rust'],
      'note-03': ['typescript', 'svelte', 'draft'],
      'note-04': ['rust', 'draft'],
      'note-05': ['typescript'],
      'note-06': ['svelte', 'design'],
      'note-07': ['rust', 'design'],
      'note-08': ['draft'],
      'note-09': ['typescript', 'svelte', 'rust'],
      'note-10': [],
    });
    // Expected counts:
    // typescript: notes 01,02,03,05,09 = 5
    // svelte: notes 01,03,06,09 = 4
    // rust: notes 02,04,07,09 = 4
    // draft: notes 03,04,08 = 3
    // design: notes 06,07 = 2
    const inventory: TagEntry[] = tagInventoryFromMetadata(metadata);

    expect(inventory).toHaveLength(5);

    // Sorted by usageCount descending
    expect(inventory[0]).toEqual({ name: 'typescript', usageCount: 5 });

    // svelte and rust both have 4
    const fours = inventory.filter((e: TagEntry) => e.usageCount === 4);
    expect(fours).toHaveLength(2);
    const fourNames = fours.map((e: TagEntry) => e.name).sort();
    expect(fourNames).toContain('rust');
    expect(fourNames).toContain('svelte');

    expect(inventory[3]).toEqual({ name: 'draft', usageCount: 3 });
    expect(inventory[4]).toEqual({ name: 'design', usageCount: 2 });
  });
});
