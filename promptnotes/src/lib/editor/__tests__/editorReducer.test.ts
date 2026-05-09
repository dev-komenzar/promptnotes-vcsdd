/**
 * editorReducer.test.ts — Tier 1 unit tests (bun:test)
 *
 * Sprint 7 Red phase. All tests MUST FAIL because the stub throws.
 *
 * Coverage:
 *   PROP-EDIT-007 (reducer totality — example cross-product)
 *   PROP-EDIT-008 (reducer purity)
 *   PROP-EDIT-012 (NoteFileSaved emits cancel-idle-timer + isDirty=false)
 *   PROP-EDIT-013 (EditorBlurredAllBlocks in saving/switching → no trigger-blur-save)
 *   PROP-EDIT-014 (focusedBlockId mirroring per arm)
 *   PROP-EDIT-015 (same-note BlockFocused keeps status=editing, no save commands)
 *
 * REQ-EDIT references appear in test description strings for CRIT-700/CRIT-701 grep.
 */

import { describe, test, expect } from 'bun:test';
import type {
  EditorViewState,
  EditorAction,
  EditorCommand,
  EditingSessionStateDto,
  SaveError,
} from '$lib/editor/types';
import { editorReducer } from '$lib/editor/editorReducer';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeIdleView(): EditorViewState {
  return {
    status: 'idle',
    isDirty: false,
    currentNoteId: null,
    focusedBlockId: null,
    pendingNextFocus: null,
    isNoteEmpty: true,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: [],
  };
}

function makeEditingView(overrides: Partial<EditorViewState> = {}): EditorViewState {
  return {
    status: 'editing',
    isDirty: false,
    currentNoteId: 'note-1',
    focusedBlockId: 'block-1',
    pendingNextFocus: null,
    isNoteEmpty: false,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: [],
    ...overrides,
  };
}

function makeSavingView(): EditorViewState {
  return {
    status: 'saving',
    isDirty: true,
    currentNoteId: 'note-1',
    focusedBlockId: null,
    pendingNextFocus: null,
    isNoteEmpty: false,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: [],
  };
}

function makeSwitchingView(): EditorViewState {
  return {
    status: 'switching',
    isDirty: false,
    currentNoteId: 'note-1',
    focusedBlockId: null,
    pendingNextFocus: { noteId: 'note-2', blockId: 'block-x' },
    isNoteEmpty: false,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: [],
  };
}

function makeSaveFailedView(overrides: Partial<EditorViewState> = {}): EditorViewState {
  const fsError: SaveError = { kind: 'fs', reason: { kind: 'permission' } };
  return {
    status: 'save-failed',
    isDirty: true,
    currentNoteId: 'note-1',
    focusedBlockId: 'block-1',
    pendingNextFocus: null,
    isNoteEmpty: false,
    lastSaveError: fsError,
    lastSaveResult: null,
    blocks: [],
    ...overrides,
  };
}

const ISSUED_AT = '2026-05-06T09:00:00.000Z';
const VALID_EDITOR_COMMAND_KINDS = new Set<string>([
  'focus-block', 'edit-block-content', 'insert-block-after', 'insert-block-at-beginning',
  'remove-block', 'merge-blocks', 'split-block', 'change-block-type', 'move-block',
  'cancel-idle-timer', 'trigger-idle-save', 'trigger-blur-save', 'retry-save',
  'discard-current-session', 'cancel-switch', 'copy-note-body', 'request-new-note',
]);

const VALID_STATUS = new Set<string>(['idle', 'editing', 'saving', 'switching', 'save-failed']);

// ── PROP-EDIT-007: Reducer totality (example cross-product) ────────────────────

describe('editorReducer totality (PROP-EDIT-007, REQ-EDIT-019..023)', () => {
  const statuses: Array<EditorViewState['status']> = ['idle', 'editing', 'saving', 'switching', 'save-failed'];

  const sampleActions: EditorAction[] = [
    { kind: 'BlockContentEdited', payload: { noteId: 'n1', blockId: 'b1', content: 'hello', issuedAt: ISSUED_AT } },
    { kind: 'BlockFocused', payload: { noteId: 'n1', blockId: 'b1', issuedAt: ISSUED_AT } },
    { kind: 'EditorBlurredAllBlocks', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'TriggerIdleSaveRequested', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'TriggerBlurSaveRequested', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'RetrySaveRequested', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'DiscardCurrentSessionRequested', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'CancelSwitchRequested', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'CopyNoteBodyRequested', payload: { noteId: 'n1', issuedAt: ISSUED_AT } },
    { kind: 'RequestNewNoteRequested', payload: { source: 'explicit-button', issuedAt: ISSUED_AT } },
  ];

  for (const status of statuses) {
    for (const action of sampleActions) {
      test(`REQ-EDIT-019..023: reducer(${status}, ${action.kind}) returns valid { state, commands }`, () => {
        const state: EditorViewState = { ...makeIdleView(), status };
        const result = editorReducer(state, action);
        expect(result).toBeDefined();
        expect(result.state).toBeDefined();
        expect(VALID_STATUS.has(result.state.status)).toBe(true);
        expect(Array.isArray(result.commands)).toBe(true);
        for (const cmd of result.commands) {
          expect(VALID_EDITOR_COMMAND_KINDS.has(cmd.kind)).toBe(true);
        }
      });
    }
  }
});

// ── PROP-EDIT-008: Reducer purity ─────────────────────────────────────────────

describe('editorReducer purity (PROP-EDIT-008, REQ-EDIT-024)', () => {
  test('REQ-EDIT-024: same inputs produce deep-equal outputs (deterministic)', () => {
    const state = makeEditingView({ isDirty: true });
    const action: EditorAction = {
      kind: 'BlockContentEdited',
      payload: { noteId: 'n1', blockId: 'b1', content: 'test', issuedAt: ISSUED_AT },
    };
    const result1 = editorReducer(state, action);
    const result2 = editorReducer(state, action);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  test('REQ-EDIT-024: original state is not mutated by reducer', () => {
    const state = makeEditingView({ isDirty: false });
    const stateBefore = JSON.stringify(state);
    const action: EditorAction = {
      kind: 'BlockContentEdited',
      payload: { noteId: 'n1', blockId: 'b1', content: 'new content', issuedAt: ISSUED_AT },
    };
    editorReducer(state, action);
    expect(JSON.stringify(state)).toBe(stateBefore);
  });
});

// ── PROP-EDIT-012: NoteFileSaved emits cancel-idle-timer + isDirty=false ───────

describe('NoteFileSaved transitions (PROP-EDIT-012, REQ-EDIT-004, REQ-EDIT-013)', () => {
  test('REQ-EDIT-004: NoteFileSaved sets isDirty=false', () => {
    const state = makeSavingView();
    // simulate receiving a snapshot that shows save completed
    const savingDoneSnapshot: EditingSessionStateDto = {
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: 'success',
    };
    const action: EditorAction = {
      kind: 'DomainSnapshotReceived',
      snapshot: savingDoneSnapshot,
    };
    const result = editorReducer(state, action);
    expect(result.state.isDirty).toBe(false);
  });

  test('REQ-EDIT-013: saving→editing snapshot emits cancel-idle-timer', () => {
    const state = makeSavingView();
    const savingDoneSnapshot: EditingSessionStateDto = {
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: 'success',
    };
    const action: EditorAction = {
      kind: 'DomainSnapshotReceived',
      snapshot: savingDoneSnapshot,
    };
    const result = editorReducer(state, action);
    const hasCancelTimer = result.commands.some(c => c.kind === 'cancel-idle-timer');
    expect(hasCancelTimer).toBe(true);
  });

  test('REQ-EDIT-004: isDirty remains true on save-failed snapshot', () => {
    const state = makeSavingView();
    const saveFailedSnapshot: EditingSessionStateDto = {
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: { kind: 'fs', reason: { kind: 'permission' } },
      isNoteEmpty: false,
    };
    const action: EditorAction = {
      kind: 'DomainSnapshotReceived',
      snapshot: saveFailedSnapshot,
    };
    const result = editorReducer(state, action);
    expect(result.state.isDirty).toBe(true);
  });
});

// ── PROP-EDIT-013: EditorBlurredAllBlocks does not emit trigger-blur-save when saving/switching

describe('EditorBlurredAllBlocks in saving/switching (PROP-EDIT-013, REQ-EDIT-016, EC-EDIT-002)', () => {
  test('EC-EDIT-002: EditorBlurredAllBlocks while saving returns commands=[] (no trigger-blur-save)', () => {
    const state = makeSavingView();
    const action: EditorAction = {
      kind: 'EditorBlurredAllBlocks',
      payload: { noteId: 'note-1', issuedAt: ISSUED_AT },
    };
    const result = editorReducer(state, action);
    const hasBlurSave = result.commands.some(c => c.kind === 'trigger-blur-save');
    expect(hasBlurSave).toBe(false);
  });

  test('EC-EDIT-002: EditorBlurredAllBlocks while switching returns commands=[] (no trigger-blur-save)', () => {
    const state = makeSwitchingView();
    const action: EditorAction = {
      kind: 'EditorBlurredAllBlocks',
      payload: { noteId: 'note-1', issuedAt: ISSUED_AT },
    };
    const result = editorReducer(state, action);
    const hasBlurSave = result.commands.some(c => c.kind === 'trigger-blur-save');
    expect(hasBlurSave).toBe(false);
  });
});

// ── PROP-EDIT-014: focusedBlockId mirroring ───────────────────────────────────

describe('DomainSnapshotReceived focusedBlockId mirroring (PROP-EDIT-014, REQ-EDIT-001, REQ-EDIT-002)', () => {
  test('REQ-EDIT-001: editing snapshot mirrors focusedBlockId', () => {
    const state = makeIdleView();
    const snapshot: EditingSessionStateDto = {
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-abc',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    };
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.focusedBlockId).toBe('block-abc');
  });

  test('REQ-EDIT-002: no action other than DomainSnapshotReceived overwrites focusedBlockId', () => {
    const state = makeEditingView({ focusedBlockId: 'block-original' });
    const action: EditorAction = {
      kind: 'BlockContentEdited',
      payload: { noteId: 'note-1', blockId: 'block-original', content: 'typed', issuedAt: ISSUED_AT },
    };
    const result = editorReducer(state, action);
    // focusedBlockId must not be changed by BlockContentEdited (only DomainSnapshotReceived changes it)
    expect(result.state.focusedBlockId).toBe('block-original');
  });

  test('REQ-EDIT-023: save-failed snapshot copies priorFocusedBlockId to focusedBlockId', () => {
    const state = makeSavingView();
    const snapshot: EditingSessionStateDto = {
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-prior',
      pendingNextFocus: null,
      lastSaveError: { kind: 'fs', reason: { kind: 'lock' } },
      isNoteEmpty: false,
    };
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.focusedBlockId).toBe('block-prior');
  });
});

// ── PROP-EDIT-015: Same-note BlockFocused keeps status=editing, no save commands ─

describe('same-note BlockFocused (PROP-EDIT-015, REQ-EDIT-017, REQ-EDIT-018, EC-EDIT-006)', () => {
  test('REQ-EDIT-017: BlockFocused while editing keeps status=editing', () => {
    const state = makeEditingView({ isDirty: true });
    const action: EditorAction = {
      kind: 'BlockFocused',
      payload: { noteId: 'note-1', blockId: 'block-2', issuedAt: ISSUED_AT },
    };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('editing');
  });

  test('REQ-EDIT-017: same-note BlockFocused emits no save commands', () => {
    const state = makeEditingView({ isDirty: true });
    const action: EditorAction = {
      kind: 'BlockFocused',
      payload: { noteId: 'note-1', blockId: 'block-2', issuedAt: ISSUED_AT },
    };
    const result = editorReducer(state, action);
    const hasSaveCmd = result.commands.some(
      c => c.kind === 'trigger-idle-save' || c.kind === 'trigger-blur-save'
    );
    expect(hasSaveCmd).toBe(false);
  });

  test('REQ-EDIT-018: same-note BlockFocused emits no cancel-timer commands', () => {
    const state = makeEditingView({ isDirty: true });
    const action: EditorAction = {
      kind: 'BlockFocused',
      payload: { noteId: 'note-1', blockId: 'block-2', issuedAt: ISSUED_AT },
    };
    const result = editorReducer(state, action);
    const hasCancelTimer = result.commands.some(c => c.kind === 'cancel-idle-timer');
    expect(hasCancelTimer).toBe(false);
  });
});

// ── PROP-IPC-023: cancel-switch transition robustness ─────────────────────────
//
// behavioral-spec.md §15.2 EC-IPC-012, verification-architecture.md §10.2 PROP-IPC-023
//
// Following EC-IPC-012: the TS reducer applied to a DomainSnapshotReceived whose
// snapshot is `Editing { focusedBlockId: null }` and whose PRIOR state was
// `switching` must NOT throw and must produce focusedBlockId: null.
//
// The Svelte EditorPanel is responsible for focus restoration via its own
// retained DOM reference (RD-022); the reducer's responsibility ends at
// mirroring the snapshot faithfully.

describe('PROP-IPC-023: cancel-switch DomainSnapshotReceived from switching state (EC-IPC-012)', () => {
  // TODO PROP-IPC-023 (Phase 2b): Replace this it.todo with the full assertion
  // once the Rust cancel_switch handler emits the Editing variant.
  //
  // Required assertion (mechanically replaceable):
  //   const switchingState: EditorViewState = makeSwitchingView();
  //   const snapshot: EditingSessionStateDto = {
  //     status: 'editing',
  //     currentNoteId: 'note-1',
  //     focusedBlockId: null,   // REQ-IPC-015: Rust emits null
  //     isDirty: true,
  //     isNoteEmpty: false,
  //     lastSaveResult: null,
  //   };
  //   const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
  //   let result: ReturnType<typeof editorReducer>;
  //   expect(() => { result = editorReducer(switchingState, action); }).not.toThrow();
  //   expect(result!.state).toBeDefined();
  //   expect(result!.state.focusedBlockId).toBeNull();
  //   expect(result!.state.status).toBe('editing');
  test.todo(
    'PROP-IPC-023: switching → DomainSnapshotReceived(Editing{focusedBlockId:null}) does not throw; result.focusedBlockId is null',
  );
});
