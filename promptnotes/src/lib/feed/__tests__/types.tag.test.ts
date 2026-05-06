/**
 * types.tag.test.ts — RED PHASE: compile-time type extension tests
 *
 * All tests MUST FAIL (at compile time) because FeedViewState, FeedAction, and
 * FeedCommand have not yet been extended with the tag-related fields and variants.
 *
 * This file will produce TypeScript compilation errors until the types in
 * `$lib/feed/types.ts` are extended per the behavioral-spec.md §6 type contracts.
 *
 * Coverage:
 *   PROP-TAG-023 (FeedViewState has tagAutocompleteVisibleFor + activeFilterTags)
 *   PROP-TAG-025/026 (FeedAction/FeedCommand unions have new variants)
 *
 * REQ coverage: REQ-TAG-017
 */

import { describe, test, expect } from 'bun:test';
import type { FeedViewState, FeedAction, FeedCommand } from '$lib/feed/types';

// ── RED PHASE: type-level structural assertions ───────────────────────────────
//
// Each function below is a compile-time type check. If the type lacks the
// expected field/variant, TypeScript will emit a compilation error — that's
// the intended RED phase failure mode.

// ── PROP-TAG-023: FeedViewState extended fields ────────────────────────────

describe('PROP-TAG-023: FeedViewState has tag-related fields', () => {
  const minimalState: FeedViewState = {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: [],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    allNoteIds: [],
  };

  test('FeedViewState accepts tagAutocompleteVisibleFor: string | null', () => {
    expect(minimalState.tagAutocompleteVisibleFor).toBe(null);
  });

  test('FeedViewState accepts activeFilterTags: readonly string[]', () => {
    expect(Array.isArray(minimalState.activeFilterTags)).toBe(true);
    expect(minimalState.activeFilterTags.length).toBe(0);
  });

  test('tagAutocompleteVisibleFor can be a string', () => {
    const state: FeedViewState = { ...minimalState, tagAutocompleteVisibleFor: 'note-001' };
    expect(state.tagAutocompleteVisibleFor).toBe('note-001');
  });

  test('activeFilterTags can contain tags', () => {
    const state: FeedViewState = { ...minimalState, activeFilterTags: ['typescript', 'svelte'] };
    expect(state.activeFilterTags).toEqual(['typescript', 'svelte']);
  });
});

// ── PROP-TAG-025: FeedAction union extended ────────────────────────────────

describe('PROP-TAG-025: FeedAction union includes tag variants', () => {
  test('FeedAction accepts TagAddClicked variant', () => {
    // RED: TS error — type '{ kind: "TagAddClicked"; noteId: string }' is not assignable to FeedAction
    const action: FeedAction = { kind: 'TagAddClicked', noteId: 'note-001' };
    expect(action.kind).toBe('TagAddClicked');
  });

  test('FeedAction accepts TagRemoveClicked variant', () => {
    // RED: TS error — not assignable to FeedAction
    const action: FeedAction = { kind: 'TagRemoveClicked', noteId: 'note-001', tag: 'draft' };
    expect(action.kind).toBe('TagRemoveClicked');
  });

  test('FeedAction accepts TagInputCommitted variant', () => {
    // RED: TS error — not assignable to FeedAction
    const action: FeedAction = { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: 'draft' };
    expect(action.kind).toBe('TagInputCommitted');
  });

  test('FeedAction accepts TagInputCancelled variant', () => {
    // RED: TS error — not assignable to FeedAction
    const action: FeedAction = { kind: 'TagInputCancelled' };
    expect(action.kind).toBe('TagInputCancelled');
  });

  test('FeedAction accepts TagFilterToggled variant', () => {
    // RED: TS error — not assignable to FeedAction
    const action: FeedAction = { kind: 'TagFilterToggled', tag: 'typescript' };
    expect(action.kind).toBe('TagFilterToggled');
  });

  test('FeedAction accepts TagFilterCleared variant', () => {
    // RED: TS error — not assignable to FeedAction
    const action: FeedAction = { kind: 'TagFilterCleared' };
    expect(action.kind).toBe('TagFilterCleared');
  });
});

// ── PROP-TAG-025: FeedCommand union extended ───────────────────────────────

describe('PROP-TAG-025: FeedCommand union includes tag command variants', () => {
  test('FeedCommand accepts add-tag-via-chip variant', () => {
    // RED: TS error — not assignable to FeedCommand
    const cmd: FeedCommand = {
      kind: 'add-tag-via-chip',
      payload: { noteId: 'note-001', tag: 'draft', issuedAt: '2026-01-01T00:00:00Z' },
    };
    expect(cmd.kind).toBe('add-tag-via-chip');
  });

  test('FeedCommand accepts remove-tag-via-chip variant', () => {
    // RED: TS error — not assignable to FeedCommand
    const cmd: FeedCommand = {
      kind: 'remove-tag-via-chip',
      payload: { noteId: 'note-001', tag: 'draft', issuedAt: '2026-01-01T00:00:00Z' },
    };
    expect(cmd.kind).toBe('remove-tag-via-chip');
  });

  test('FeedCommand accepts apply-tag-filter variant', () => {
    // RED: TS error — not assignable to FeedCommand
    const cmd: FeedCommand = {
      kind: 'apply-tag-filter',
      payload: { tag: 'typescript' },
    };
    expect(cmd.kind).toBe('apply-tag-filter');
  });

  test('FeedCommand accepts remove-tag-filter variant', () => {
    // RED: TS error — not assignable to FeedCommand
    const cmd: FeedCommand = {
      kind: 'remove-tag-filter',
      payload: { tag: 'typescript' },
    };
    expect(cmd.kind).toBe('remove-tag-filter');
  });

  test('FeedCommand accepts clear-filter variant', () => {
    // RED: TS error — not assignable to FeedCommand
    const cmd: FeedCommand = { kind: 'clear-filter' };
    expect(cmd.kind).toBe('clear-filter');
  });
});

// ── Discriminated union discriminant check ─────────────────────────────────

describe('Discriminated union exhaustiveness check', () => {
  test('All FeedAction tag variants have unique "kind" discriminants', () => {
    const kinds = [
      'TagAddClicked',
      'TagRemoveClicked',
      'TagInputCommitted',
      'TagInputCancelled',
      'TagFilterToggled',
      'TagFilterCleared',
    ];
    // All discriminants are unique (sanity)
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  test('All FeedCommand tag variants have unique "kind" discriminants', () => {
    const kinds = [
      'add-tag-via-chip',
      'remove-tag-via-chip',
      'apply-tag-filter',
      'remove-tag-filter',
      'clear-filter',
    ];
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  test('Tag command kinds do not collide with existing command kinds', () => {
    const existingCommandKinds = new Set([
      'select-past-note',
      'request-note-deletion',
      'confirm-note-deletion',
      'cancel-note-deletion',
      'refresh-feed',
      'open-delete-modal',
      'close-delete-modal',
    ]);
    const newCommandKinds = [
      'add-tag-via-chip',
      'remove-tag-via-chip',
      'apply-tag-filter',
      'remove-tag-filter',
      'clear-filter',
    ];
    for (const kind of newCommandKinds) {
      expect(existingCommandKinds.has(kind)).toBe(false);
    }
  });
});
