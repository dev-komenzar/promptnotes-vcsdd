/**
 * feedReducer.tag.test.ts — RED PHASE: tag chip reducer tests
 *
 * All tests MUST FAIL because the feedReducer does not yet handle
 * the new FeedAction variants (TagAddClicked, TagRemoveClicked, etc.)
 * and FeedViewState does not yet have tagAutocompleteVisibleFor / activeFilterTags.
 *
 * Coverage:
 *   PROP-TAG-024 (activeFilterTags preservation across DomainSnapshotReceived)
 *   PROP-TAG-025 (feedReducer handles all new FeedAction variants)
 *   PROP-TAG-033 (note deletion closes tag input — EC-023)
 *   PROP-TAG-004 (mutual exclusion: TagAddClicked closes other row — EC-018a)
 *   PROP-TAG-006 (TagInputCommitted dispatches add-tag-via-chip)
 *   PROP-TAG-007/008 (TagError: empty / whitespace)
 *   PROP-TAG-009 (Escape cancels tag input)
 *   PROP-TAG-010 (blur with valid text commits)
 *   PROP-TAG-032 (max tag length rejection — EC-007c)
 *
 * REQ coverage: REQ-TAG-002..008, REQ-TAG-010..012, REQ-TAG-017, EC-018a, EC-007c, EC-023
 */

import { describe, test, expect } from 'bun:test';
import type { FeedViewState, FeedAction, FeedDomainSnapshot } from '$lib/feed/types';
import { feedReducer } from '$lib/feed/feedReducer';
import { tryNewTag } from '$lib/domain/apply-filter-or-search/try-new-tag.js';

// ── RED PHASE: types not yet extended ─────────────────────────────────────────
//
// FeedViewState lacks tagAutocompleteVisibleFor and activeFilterTags.
// FeedAction has no tag variants (TagAddClicked, etc.).
// FeedCommand has no tag command variants (add-tag-via-chip, etc.).
//
// We cast through `unknown` to get past TypeScript compilation so the tests
// can run and FAIL against the current feedReducer default branch.

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Extended state shape that WILL exist after implementation. RED phase: cast to FeedViewState. */
interface ExtendedFeedViewState extends FeedViewState {
  tagAutocompleteVisibleFor: string | null;
  activeFilterTags: readonly string[];
  allNoteIds: readonly string[];
}

function makeInitialState(overrides: Partial<ExtendedFeedViewState> = {}): ExtendedFeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: ['note-001', 'note-002', 'note-003'],
    allNoteIds: ['note-001', 'note-002', 'note-003'],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<FeedDomainSnapshot> = {}): FeedDomainSnapshot {
  return {
    editing: {
      status: 'idle',
      currentNoteId: null,
      pendingNextNoteId: null,
    },
    feed: {
      visibleNoteIds: ['note-001', 'note-002'],
      filterApplied: false,
    },
    delete: {
      activeDeleteModalNoteId: null,
      lastDeletionError: null,
    },
    noteMetadata: {},
    cause: { kind: 'EditingStateChanged' },
    ...overrides,
  };
}

/** Safe cast: reducer currently only handles existing FeedAction variants. */
function callReducer(state: ExtendedFeedViewState, action: object): ReturnType<typeof feedReducer> {
  return feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
}

// ── REQ-TAG-004: TagAddClicked (mutual exclusion) ──────────────────────────

describe('REQ-TAG-004: TagAddClicked — opens input with mutual exclusion', () => {
  test('TagAddClicked sets tagAutocompleteVisibleFor to the clicked noteId (RED: FAILS)', () => {
    const state = makeInitialState();
    // RED: reducer default branch returns state unchanged — tagAutocompleteVisibleFor stays null
    const result = callReducer(state, { kind: 'TagAddClicked', noteId: 'note-001' });
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-001');
  });

  test('TagAddClicked closes input on another row first — mutual exclusion (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-002' });
    // RED: clicking + on note-001 should close note-002's input, open note-001
    const result = callReducer(state, { kind: 'TagAddClicked', noteId: 'note-001' });
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-001');
  });

  test('TagAddClicked on the same row that already has open input — no change needed (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const result = callReducer(state, { kind: 'TagAddClicked', noteId: 'note-001' });
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-001');
  });
});

// ── REQ-TAG-002: TagRemoveClicked — emits remove-tag-via-chip command ──────

describe('REQ-TAG-002: TagRemoveClicked emits remove-tag-via-chip command', () => {
  test('TagRemoveClicked emits remove-tag-via-chip with correct noteId and tag (RED: FAILS)', () => {
    const state = makeInitialState();
    const result = callReducer(state, { kind: 'TagRemoveClicked', noteId: 'note-001', tag: 'draft' });
    const removeCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'remove-tag-via-chip'
    );
    expect(removeCmd).toBeDefined();
    expect(removeCmd).toMatchObject({
      kind: 'remove-tag-via-chip',
      payload: { noteId: 'note-001', tag: 'draft' },
    });
  });

  test('TagRemoveClicked when tag input is open on same row — closes input first, still dispatches remove (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const result = callReducer(state, { kind: 'TagRemoveClicked', noteId: 'note-001', tag: 'typescript' });
    // Input should be closed
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', null);
    // Remove command should still be dispatched
    const removeCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'remove-tag-via-chip'
    );
    expect(removeCmd).toBeDefined();
  });
});

// ── REQ-TAG-005: TagInputCommitted — validates via tryNewTag ───────────────

describe('REQ-TAG-005: TagInputCommitted — validates and emits add-tag-via-chip', () => {
  test('TagInputCommitted with valid tag emits add-tag-via-chip command (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const rawTag = 'draft';
    // Verify tryNewTag accepts this raw tag (sanity check on the real function)
    const validation = tryNewTag(rawTag);
    expect(validation.ok).toBe(true);

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag });
    const addCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'add-tag-via-chip'
    );
    expect(addCmd).toBeDefined();
    // The normalized tag should be in the payload
    expect(addCmd).toMatchObject({
      kind: 'add-tag-via-chip',
      payload: { noteId: 'note-001', tag: 'draft' },
    });
  });

  test('TagInputCommitted normalizes tag (e.g. strips leading "#") (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const rawTag = '#Draft';
    // Real tryNewTag: '#Draft' → strips '#' → 'Draft' → lowercase → 'draft'
    const validation = tryNewTag(rawTag);
    expect(validation.ok).toBe(true);

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag });
    const addCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'add-tag-via-chip'
    );
    expect(addCmd).toBeDefined();
    expect(addCmd).toMatchObject({
      kind: 'add-tag-via-chip',
      payload: { noteId: 'note-001', tag: 'draft' },
    });
  });

  test('TagInputCommitted closes input after valid commit (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: 'draft' });
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', null);
  });
});

// ── EC-001 / EC-002: TagInputCommitted with empty/whitespace ───────────────

describe('REQ-TAG-006: TagInputCommitted with invalid tags — no dispatch', () => {
  test('TagInputCommitted with empty string does NOT emit command (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    // Real tryNewTag returns error for empty string
    const validation = tryNewTag('');
    expect(validation.ok).toBe(false);

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: '' });
    // No command should be emitted
    const tagCommands = result.commands.filter(
      (c: Record<string, unknown>) =>
        c.kind === 'add-tag-via-chip' || c.kind === 'remove-tag-via-chip'
    );
    expect(tagCommands).toHaveLength(0);
    // Input should remain open? Or close? Spec says display error and not dispatch.
    // The input stays open so user can correct. But the reducer closes it for
    // committed action — the component handles error display separately.
  });

  test('TagInputCommitted with whitespace-only does NOT emit command (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    // Real tryNewTag returns error for whitespace-only
    const validation = tryNewTag('   ');
    expect(validation.ok).toBe(false);

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: '   ' });
    const tagCommands = result.commands.filter(
      (c: Record<string, unknown>) =>
        c.kind === 'add-tag-via-chip' || c.kind === 'remove-tag-via-chip'
    );
    expect(tagCommands).toHaveLength(0);
  });

  test('TagInputCommitted with only "#" does NOT emit command (EC-003) (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    // Real tryNewTag: '#' → strip '#' → empty → error
    const validation = tryNewTag('#');
    expect(validation.ok).toBe(false);

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: '#' });
    const tagCommands = result.commands.filter(
      (c: Record<string, unknown>) =>
        c.kind === 'add-tag-via-chip' || c.kind === 'remove-tag-via-chip'
    );
    expect(tagCommands).toHaveLength(0);
  });
});

// ── EC-007c: Max tag length (100 characters) ──────────────────────────────

describe('EC-007c: Tag longer than 100 characters after normalization — rejected', () => {
  test('Tag exceeding 100 chars after normalization does NOT emit command (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    // Construct a tag that normalized is 101 chars
    const longTag = 'a'.repeat(101);
    // tryNewTag will accept it (domain has no length limit), but UI layer enforces max 100
    const validation = tryNewTag(longTag);
    expect(validation.ok).toBe(true); // domain accepts, UI layer rejects

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: longTag });
    // Should NOT emit add-tag-via-chip
    const addCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'add-tag-via-chip'
    );
    expect(addCmd).toBeUndefined();
    // Input should remain open (user can edit)
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-001');
  });

  test('Tag at exactly 100 chars IS accepted (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const exact100Tag = 'a'.repeat(100);
    const validation = tryNewTag(exact100Tag);
    expect(validation.ok).toBe(true);

    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: exact100Tag });
    const addCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'add-tag-via-chip'
    );
    expect(addCmd).toBeDefined();
    expect(addCmd).toMatchObject({
      kind: 'add-tag-via-chip',
      payload: { noteId: 'note-001', tag: exact100Tag },
    });
  });

  // ── Bugfix: duplicate tag via chip ───────────────────────────────────
  test('TagInputCommitted with duplicate tag still emits command (domain handles idempotency; UI dedup in FeedList)', () => {
    const state = makeInitialState({
      noteMetadata: {
        'note-001': { body: 'test', createdAt: 1, updatedAt: 1, tags: ['draft'] },
      },
    });
    const result = callReducer(state, { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: 'draft' });
    const addCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'add-tag-via-chip'
    );
    expect(addCmd).toBeDefined();
    expect(addCmd).toMatchObject({
      kind: 'add-tag-via-chip',
      payload: { noteId: 'note-001', tag: 'draft' },
    });
  });
});

// ── REQ-TAG-007: TagInputCancelled ─────────────────────────────────────────

describe('REQ-TAG-007: TagInputCancelled clears tagAutocompleteVisibleFor', () => {
  test('TagInputCancelled sets tagAutocompleteVisibleFor to null (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const result = callReducer(state, { kind: 'TagInputCancelled' });
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', null);
  });

  test('TagInputCancelled emits no commands (RED: FAILS)', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-001' });
    const result = callReducer(state, { kind: 'TagInputCancelled' });
    expect(result.commands).toHaveLength(0);
  });
});

// ── REQ-TAG-010 / REQ-TAG-011: TagFilterToggled ────────────────────────────

describe('REQ-TAG-010/011: TagFilterToggled — add/remove from activeFilterTags', () => {
  test('TagFilterToggled adds tag to activeFilterTags and emits apply-tag-filter (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: [] });
    const result = callReducer(state, { kind: 'TagFilterToggled', tag: 'typescript' });

    // activeFilterTags should now contain 'typescript'
    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toContain('typescript');
    expect(tags).toHaveLength(1);

    // Should emit apply-tag-filter command
    const filterCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'apply-tag-filter'
    );
    expect(filterCmd).toBeDefined();
    expect(filterCmd).toMatchObject({
      kind: 'apply-tag-filter',
      payload: { tag: 'typescript' },
    });
  });

  test('TagFilterToggled removes already-selected tag and emits remove-tag-filter (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: ['typescript', 'svelte'] });
    const result = callReducer(state, { kind: 'TagFilterToggled', tag: 'typescript' });

    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toContain('svelte');
    expect(tags).not.toContain('typescript');
    expect(tags).toHaveLength(1);

    // Should emit remove-tag-filter command
    const removeFilterCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'remove-tag-filter'
    );
    expect(removeFilterCmd).toBeDefined();
    expect(removeFilterCmd).toMatchObject({
      kind: 'remove-tag-filter',
      payload: { tag: 'typescript' },
    });
  });

  test('TagFilterToggled idempotent: toggling a tag multiple times (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: [] });
    // First toggle: add
    const r1 = callReducer(state, { kind: 'TagFilterToggled', tag: 'draft' });
    const tags1 = (r1.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags1).toContain('draft');

    // Second toggle: remove
    const s1 = { ...r1.state, activeFilterTags: tags1 } as ExtendedFeedViewState;
    const r2 = callReducer(s1, { kind: 'TagFilterToggled', tag: 'draft' });
    const tags2 = (r2.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags2).not.toContain('draft');
  });

  test('TagFilterToggled filters visibleNoteIds: notes without matching tag are hidden', () => {
    const state = makeInitialState({
      allNoteIds: ['note-001', 'note-002', 'note-003'],
      visibleNoteIds: ['note-001', 'note-002', 'note-003'],
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: ['draft'] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: ['review'] },
        'note-003': { body: 'c', createdAt: 3, updatedAt: 3, tags: ['draft', 'review'] },
      },
    });
    const result = callReducer(state, { kind: 'TagFilterToggled', tag: 'draft' });
    const ids = result.state.visibleNoteIds;
    expect(ids).toContain('note-001');
    expect(ids).not.toContain('note-002');
    expect(ids).toContain('note-003');
    expect(ids).toHaveLength(2);
  });

  test('TagFilterToggled: adding second tag uses OR semantics (notes matching either tag shown)', () => {
    const state = makeInitialState({
      allNoteIds: ['note-001', 'note-002', 'note-003'],
      activeFilterTags: ['draft'],
      visibleNoteIds: ['note-001', 'note-003'],
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: ['draft'] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: ['review'] },
        'note-003': { body: 'c', createdAt: 3, updatedAt: 3, tags: ['draft', 'review'] },
      },
    });
    const result = callReducer(state, { kind: 'TagFilterToggled', tag: 'review' });
    const ids = result.state.visibleNoteIds;
    // OR semantics: notes with 'draft' OR 'review'
    expect(ids).toContain('note-001'); // has draft
    expect(ids).toContain('note-002'); // has review
    expect(ids).toContain('note-003'); // has both
    expect(ids).toHaveLength(3);
  });

  test('TagFilterToggled: removing last active tag restores full visibleNoteIds', () => {
    const state = makeInitialState({
      allNoteIds: ['note-001', 'note-002', 'note-003'],
      activeFilterTags: ['draft'],
      visibleNoteIds: ['note-001', 'note-003'],
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: ['draft'] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: ['review'] },
        'note-003': { body: 'c', createdAt: 3, updatedAt: 3, tags: ['draft'] },
      },
    });
    const result = callReducer(state, { kind: 'TagFilterToggled', tag: 'draft' });
    const ids = result.state.visibleNoteIds;
    expect(ids).toEqual(['note-001', 'note-002', 'note-003']);
  });
});

// ── REQ-TAG-012: TagFilterCleared ──────────────────────────────────────────

describe('REQ-TAG-012: TagFilterCleared — clears all active filters', () => {
  test('TagFilterCleared sets activeFilterTags to empty and emits clear-filter (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: ['typescript', 'svelte', 'draft'] });
    const result = callReducer(state, { kind: 'TagFilterCleared' });

    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toHaveLength(0);

    // Should emit clear-filter command
    const clearCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'clear-filter'
    );
    expect(clearCmd).toBeDefined();
  });

  test('TagFilterCleared with no active filters is a no-op for state, still emits clear-filter (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: [] });
    const result = callReducer(state, { kind: 'TagFilterCleared' });

    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toHaveLength(0);

    const clearCmd = result.commands.find(
      (c: Record<string, unknown>) => c.kind === 'clear-filter'
    );
    expect(clearCmd).toBeDefined();
  });

  test('TagFilterCleared restores full visibleNoteIds from allNoteIds', () => {
    const state = makeInitialState({
      allNoteIds: ['note-001', 'note-002', 'note-003'],
      activeFilterTags: ['draft'],
      visibleNoteIds: ['note-001', 'note-003'],
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: ['draft'] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: ['review'] },
        'note-003': { body: 'c', createdAt: 3, updatedAt: 3, tags: ['draft'] },
      },
    });
    const result = callReducer(state, { kind: 'TagFilterCleared' });
    expect(result.state.visibleNoteIds).toEqual(['note-001', 'note-002', 'note-003']);
  });
});

// ── PROP-TAG-024: activeFilterTags preservation across DomainSnapshotReceived ─

describe('PROP-TAG-024: DomainSnapshotReceived preserves activeFilterTags and tagAutocompleteVisibleFor', () => {
  test('activeFilterTags is preserved across DomainSnapshotReceived (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: ['typescript', 'draft'] });
    const snapshot = makeSnapshot({
      cause: { kind: 'EditingStateChanged' },
      editing: { status: 'editing', currentNoteId: 'note-x', pendingNextNoteId: null },
    });
    // Call the REAL feedReducer (no cast needed for DomainSnapshotReceived — it already handles it)
    const result = feedReducer(state as unknown as FeedViewState, {
      kind: 'DomainSnapshotReceived',
      snapshot,
    });
    // activeFilterTags should survive the snapshot mirroring
    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toEqual(['typescript', 'draft']);
  });

  test('tagAutocompleteVisibleFor is preserved across DomainSnapshotReceived when note still exists', () => {
    const state = makeInitialState({ tagAutocompleteVisibleFor: 'note-002' });
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileSaved', savedNoteId: 'note-001' },
      noteMetadata: {
        'note-002': { body: 'test', createdAt: 1, updatedAt: 1, tags: [] },
      },
    });
    const result = feedReducer(state as unknown as FeedViewState, {
      kind: 'DomainSnapshotReceived',
      snapshot,
    });
    // tagAutocompleteVisibleFor should survive
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-002');
  });

  test('loadingStatus preservation pattern still works alongside new fields', () => {
    const state = makeInitialState({
      loadingStatus: 'ready',
      activeFilterTags: ['draft'],
      tagAutocompleteVisibleFor: 'note-001',
    });
    const snapshot = makeSnapshot({
      cause: { kind: 'InitialLoad' },
      editing: { status: 'idle', currentNoteId: null, pendingNextNoteId: null },
      noteMetadata: {
        'note-001': { body: 'test', createdAt: 1, updatedAt: 1, tags: ['draft'] },
      },
    });
    const result = feedReducer(state as unknown as FeedViewState, {
      kind: 'DomainSnapshotReceived',
      snapshot,
    });
    // loadingStatus preserved (existing behavior)
    expect(result.state.loadingStatus).toBe('ready');
    // New fields also preserved
    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toEqual(['draft']);
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-001');
  });
});

// ── EC-023: Note deletion closes tag input if open on the deleted note ─────

describe('EC-023: Note deletion closes tag input (PROP-TAG-033)', () => {
  test('DomainSnapshotReceived with note removed closes tag input on that note (RED: FAILS)', () => {
    const state = makeInitialState({
      tagAutocompleteVisibleFor: 'note-003',
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: [] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: [] },
        'note-003': { body: 'c', createdAt: 3, updatedAt: 3, tags: ['draft'] },
      },
    });
    // Note 'note-003' is deleted — removed from noteMetadata
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-003' },
      feed: { visibleNoteIds: ['note-001', 'note-002'], filterApplied: false },
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: [] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: [] },
      },
    });
    const result = feedReducer(state as unknown as FeedViewState, {
      kind: 'DomainSnapshotReceived',
      snapshot,
    });
    // tagAutocompleteVisibleFor was 'note-003' — note deleted → should clear
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', null);
  });

  test('DomainSnapshotReceived with note removed but tag input open on DIFFERENT note — preserves it (RED: FAILS)', () => {
    const state = makeInitialState({
      tagAutocompleteVisibleFor: 'note-001',
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: [] },
        'note-002': { body: 'b', createdAt: 2, updatedAt: 2, tags: [] },
      },
    });
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-002' },
      feed: { visibleNoteIds: ['note-001'], filterApplied: false },
      noteMetadata: {
        'note-001': { body: 'a', createdAt: 1, updatedAt: 1, tags: [] },
      },
    });
    const result = feedReducer(state as unknown as FeedViewState, {
      kind: 'DomainSnapshotReceived',
      snapshot,
    });
    // tag input is on note-001 (not deleted) — should be preserved
    expect(result.state).toHaveProperty('tagAutocompleteVisibleFor', 'note-001');
  });
});

// ── REQ-TAG-019: Zero-filter state ─────────────────────────────────────────

describe('REQ-TAG-019: Zero-filter state — empty activeFilterTags means no filter', () => {
  test('Initial state has empty activeFilterTags (RED: FAILS)', () => {
    const state = makeInitialState();
    const tags = state.activeFilterTags;
    expect(tags).toHaveLength(0);
  });

  test('After TagFilterCleared, activeFilterTags is empty (RED: FAILS)', () => {
    const state = makeInitialState({ activeFilterTags: ['typescript'] });
    const result = callReducer(state, { kind: 'TagFilterCleared' });
    const tags = (result.state as unknown as ExtendedFeedViewState).activeFilterTags;
    expect(tags).toHaveLength(0);
  });
});

// ── Exhaustiveness: all new FeedAction variants produce valid output ────────

describe('PROP-TAG-025/026: Exhaustiveness — all new FeedAction variants produce valid output', () => {
  const newActions = [
    { kind: 'TagAddClicked', noteId: 'note-001' },
    { kind: 'TagRemoveClicked', noteId: 'note-001', tag: 'draft' },
    { kind: 'TagInputCommitted', noteId: 'note-001', rawTag: 'draft' },
    { kind: 'TagInputCancelled' },
    { kind: 'TagFilterToggled', tag: 'typescript' },
    { kind: 'TagFilterCleared' },
  ];

  for (const action of newActions) {
    test(`feedReducer handles ${action.kind} without throwing (RED: FAILS for proper handling)`, () => {
      const state = makeInitialState();
      // RED: reducer currently returns { state, commands: [] } via default branch
      // This "doesn't throw" but also doesn't implement the behavior — our
      // assertions below will catch that in the specific tests above.
      expect(() => callReducer(state, action)).not.toThrow();
    });

    test(`feedReducer result for ${action.kind} has valid state shape (RED: FAILS for new fields)`, () => {
      const state = makeInitialState();
      const result = callReducer(state, action);
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('commands');
      expect(Array.isArray(result.commands)).toBe(true);
    });
  }
});
