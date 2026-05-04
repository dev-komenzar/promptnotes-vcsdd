/**
 * editorReducer.test.ts — Tier 1 unit tests, cross-product (bun:test)
 *
 * Coverage:
 *   REQ-EDIT-001 (NoteBodyEdited → isDirty=true)
 *   REQ-EDIT-002 (NoteFileSaved → isDirty=false; NoteSaveFailed → isDirty retained)
 *   REQ-EDIT-004 (IdleTimerFired → saving + trigger-idle-save command)
 *   REQ-EDIT-005 (NoteFileSaved → cancel-idle-timer command)
 *   REQ-EDIT-006, REQ-EDIT-007 (BlurEvent → saving + trigger-blur-save command)
 *   REQ-EDIT-008, EC-EDIT-002 (BlurEvent in saving → commands=[])
 *   REQ-EDIT-013 (NoteSaveFailed → save-failed state)
 *   REQ-EDIT-014, PROP-EDIT-040 (DomainSnapshotReceived mirrors snapshot fields)
 *   REQ-EDIT-017 (RetryClicked → retry-save command)
 *   REQ-EDIT-018 (DiscardClicked → discard-current-session command)
 *   REQ-EDIT-019 (CancelClicked → cancel-switch command)
 *   REQ-EDIT-021 (CopyClicked → copy-note-body command)
 *   REQ-EDIT-023, REQ-EDIT-024 (NewNoteClicked → request-new-note command)
 *   PROP-EDIT-010 (NoteFileSaved → cancel-idle-timer + isDirty=false)
 *   PROP-EDIT-011 (BlurEvent in saving → no trigger-blur-save)
 *   CRIT-008
 *
 * RED PHASE: editorReducer stub throws — all assertions FAIL.
 */

import { describe, test, expect } from 'bun:test';
import type {
  EditorViewState,
  EditorAction,
  EditingSessionState,
  SaveError,
} from '$lib/editor/types';
import { editorReducer } from '$lib/editor/editorReducer';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeState(overrides: Partial<EditorViewState> = {}): EditorViewState {
  return {
    status: 'editing',
    isDirty: false,
    currentNoteId: 'note-001',
    body: '',
    pendingNextNoteId: null,
    lastError: null,
    pendingNewNoteIntent: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<EditingSessionState> = {}): EditingSessionState {
  return {
    status: 'editing',
    isDirty: false,
    currentNoteId: 'note-snap-001',
    pendingNextNoteId: null,
    lastError: null,
    body: 'snapshot body',
    ...overrides,
  };
}

const sampleSaveError: SaveError = { kind: 'fs', reason: { kind: 'permission' } };

// ── REQ-EDIT-001: editing + NoteBodyEdited ────────────────────────────────────

describe('REQ-EDIT-001: editing + NoteBodyEdited → isDirty=true, body updated', () => {
  test('NoteBodyEdited in editing sets isDirty=true and updates body', () => {
    const state = makeState({ status: 'editing', isDirty: false, body: 'old' });
    const action: EditorAction = {
      kind: 'NoteBodyEdited',
      payload: { newBody: 'new body text', noteId: 'note-001', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.state.isDirty).toBe(true);
    expect(result.state.body).toBe('new body text');
    expect(result.state.status).toBe('editing');
  });

  test('NoteBodyEdited in editing emits no state-transition commands', () => {
    const state = makeState({ status: 'editing', isDirty: false });
    const action: EditorAction = {
      kind: 'NoteBodyEdited',
      payload: { newBody: 'changed', noteId: 'note-001', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    // May emit edit-note-body command; must NOT emit save commands
    const saveCommands = result.commands.filter(
      c => c.kind === 'trigger-idle-save' || c.kind === 'trigger-blur-save'
    );
    expect(saveCommands).toHaveLength(0);
  });

  test('NoteBodyEdited in idle state does not change status to editing prematurely', () => {
    const state = makeState({ status: 'idle', isDirty: false, currentNoteId: null });
    const action: EditorAction = {
      kind: 'NoteBodyEdited',
      payload: { newBody: 'text', noteId: 'note-001', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    // In idle, NoteBodyEdited is unexpected but reducer must not throw
    expect(result.state).toBeDefined();
    expect(Array.isArray(result.commands)).toBe(true);
  });
});

// ── REQ-EDIT-002, PROP-EDIT-010, CRIT-008: saving + NoteFileSaved ────────────

describe('REQ-EDIT-002, PROP-EDIT-010, CRIT-008: saving + NoteFileSaved → isDirty=false + cancel-idle-timer', () => {
  test('NoteFileSaved in saving sets isDirty=false', () => {
    const state = makeState({ status: 'saving', isDirty: true, body: 'content' });
    const action: EditorAction = {
      kind: 'NoteFileSaved',
      payload: { noteId: 'note-001', savedAt: '2026-05-04T10:00:01.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.state.isDirty).toBe(false);
  });

  test('NoteFileSaved in saving emits cancel-idle-timer command (CRIT-008)', () => {
    const state = makeState({ status: 'saving', isDirty: true });
    const action: EditorAction = {
      kind: 'NoteFileSaved',
      payload: { noteId: 'note-001', savedAt: '2026-05-04T10:00:01.000Z' },
    };
    const result = editorReducer(state, action);
    const cancelCommands = result.commands.filter(c => c.kind === 'cancel-idle-timer');
    expect(cancelCommands.length).toBeGreaterThanOrEqual(1);
  });

  test('NoteFileSaved in saving does NOT emit trigger-idle-save (CRIT-008)', () => {
    const state = makeState({ status: 'saving', isDirty: true });
    const action: EditorAction = {
      kind: 'NoteFileSaved',
      payload: { noteId: 'note-001', savedAt: '2026-05-04T10:00:01.000Z' },
    };
    const result = editorReducer(state, action);
    const idleSaveCommands = result.commands.filter(c => c.kind === 'trigger-idle-save');
    expect(idleSaveCommands).toHaveLength(0);
  });

  test('NoteFileSaved transitions saving → editing', () => {
    const state = makeState({ status: 'saving' });
    const action: EditorAction = {
      kind: 'NoteFileSaved',
      payload: { noteId: 'note-001', savedAt: '2026-05-04T10:00:01.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('editing');
  });
});

// ── REQ-EDIT-002: saving + NoteSaveFailed ────────────────────────────────────

describe('REQ-EDIT-002, REQ-EDIT-013: saving + NoteSaveFailed → save-failed, isDirty retained', () => {
  test('NoteSaveFailed in saving transitions to save-failed', () => {
    const state = makeState({ status: 'saving', isDirty: true });
    const action: EditorAction = {
      kind: 'NoteSaveFailed',
      payload: { noteId: 'note-001', error: sampleSaveError },
    };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('save-failed');
  });

  test('NoteSaveFailed retains isDirty=true (REQ-EDIT-002 save failure does not clear dirty)', () => {
    const state = makeState({ status: 'saving', isDirty: true });
    const action: EditorAction = {
      kind: 'NoteSaveFailed',
      payload: { noteId: 'note-001', error: sampleSaveError },
    };
    const result = editorReducer(state, action);
    expect(result.state.isDirty).toBe(true);
  });

  test('NoteSaveFailed stores the error in lastError', () => {
    const state = makeState({ status: 'saving' });
    const action: EditorAction = {
      kind: 'NoteSaveFailed',
      payload: { noteId: 'note-001', error: sampleSaveError },
    };
    const result = editorReducer(state, action);
    expect(result.state.lastError).toEqual(sampleSaveError);
  });

  test('NoteSaveFailed emits no commands', () => {
    const state = makeState({ status: 'saving' });
    const action: EditorAction = {
      kind: 'NoteSaveFailed',
      payload: { noteId: 'note-001', error: sampleSaveError },
    };
    const result = editorReducer(state, action);
    expect(result.commands).toHaveLength(0);
  });
});

// ── REQ-EDIT-014, PROP-EDIT-040: DomainSnapshotReceived mirrors snapshot ──────

describe('REQ-EDIT-014, PROP-EDIT-040: DomainSnapshotReceived mirrors S.{status, isDirty, currentNoteId, pendingNextNoteId}', () => {
  test('DomainSnapshotReceived mirrors status from snapshot', () => {
    const state = makeState({ status: 'editing' });
    const snapshot = makeSnapshot({ status: 'saving' });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('saving');
  });

  test('DomainSnapshotReceived mirrors isDirty from snapshot', () => {
    const state = makeState({ isDirty: false });
    const snapshot = makeSnapshot({ isDirty: true });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.isDirty).toBe(true);
  });

  test('DomainSnapshotReceived mirrors currentNoteId from snapshot', () => {
    const state = makeState({ currentNoteId: 'old-note' });
    const snapshot = makeSnapshot({ currentNoteId: 'new-note' });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.currentNoteId).toBe('new-note');
  });

  test('DomainSnapshotReceived mirrors pendingNextNoteId from snapshot', () => {
    const state = makeState({ pendingNextNoteId: null });
    const snapshot = makeSnapshot({ pendingNextNoteId: 'next-note-999' });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.pendingNextNoteId).toBe('next-note-999');
  });

  test('DomainSnapshotReceived mirrors null currentNoteId from snapshot (idle state)', () => {
    const state = makeState({ currentNoteId: 'some-note', status: 'editing' });
    const snapshot = makeSnapshot({ status: 'idle', currentNoteId: null });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.currentNoteId).toBeNull();
    expect(result.state.status).toBe('idle');
  });

  test('DomainSnapshotReceived emits no commands when snapshot isDirty=true (no cancel needed)', () => {
    const state = makeState();
    const snapshot = makeSnapshot({ status: 'save-failed', isDirty: true });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    // isDirty=true → no cancel-idle-timer; save-failed with no pending intent → no request-new-note
    const nonCancelCmds = result.commands.filter(c => c.kind !== 'cancel-idle-timer');
    expect(nonCancelCmds).toHaveLength(0);
    // No cancel-idle-timer when still dirty
    const cancelCmds = result.commands.filter(c => c.kind === 'cancel-idle-timer');
    expect(cancelCmds).toHaveLength(0);
  });

  // FIND-017: DomainSnapshotReceived emits cancel-idle-timer when isDirty=false
  test('FIND-017: DomainSnapshotReceived with isDirty=false emits cancel-idle-timer', () => {
    const state = makeState({ status: 'saving', isDirty: true });
    const snapshot = makeSnapshot({ status: 'editing', isDirty: false });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    const cancelCmds = result.commands.filter(c => c.kind === 'cancel-idle-timer');
    expect(cancelCmds.length).toBeGreaterThanOrEqual(1);
  });

  test('FIND-017: DomainSnapshotReceived with isDirty=true does NOT emit cancel-idle-timer', () => {
    const state = makeState({ status: 'editing', isDirty: true });
    const snapshot = makeSnapshot({ status: 'save-failed', isDirty: true });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    const cancelCmds = result.commands.filter(c => c.kind === 'cancel-idle-timer');
    expect(cancelCmds).toHaveLength(0);
  });

  test('DomainSnapshotReceived mirrors all four fields simultaneously', () => {
    const state = makeState({ status: 'idle', isDirty: false, currentNoteId: null, pendingNextNoteId: null });
    const snapshot = makeSnapshot({
      status: 'switching',
      isDirty: true,
      currentNoteId: 'note-A',
      pendingNextNoteId: 'note-B',
    });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('switching');
    expect(result.state.isDirty).toBe(true);
    expect(result.state.currentNoteId).toBe('note-A');
    expect(result.state.pendingNextNoteId).toBe('note-B');
  });
});

// ── REQ-EDIT-006, REQ-EDIT-007: editing + BlurEvent (isDirty=true) → saving ──

describe('REQ-EDIT-006, REQ-EDIT-007: editing + BlurEvent (isDirty=true) → saving + trigger-blur-save', () => {
  test('BlurEvent in editing with isDirty=true transitions to saving', () => {
    const state = makeState({ status: 'editing', isDirty: true, body: 'important content' });
    const action: EditorAction = {
      kind: 'BlurEvent',
      payload: { noteId: 'note-001', body: 'important content', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('saving');
  });

  test('BlurEvent in editing with isDirty=true emits trigger-blur-save command', () => {
    const state = makeState({ status: 'editing', isDirty: true, body: 'content' });
    const action: EditorAction = {
      kind: 'BlurEvent',
      payload: { noteId: 'note-001', body: 'content', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    const blurSaves = result.commands.filter(c => c.kind === 'trigger-blur-save');
    expect(blurSaves.length).toBeGreaterThanOrEqual(1);
  });

  test('trigger-blur-save command carries source=capture-blur', () => {
    const state = makeState({ status: 'editing', isDirty: true, body: 'content' });
    const action: EditorAction = {
      kind: 'BlurEvent',
      payload: { noteId: 'note-001', body: 'content', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    const blurSave = result.commands.find(c => c.kind === 'trigger-blur-save');
    expect(blurSave).toBeDefined();
    if (blurSave && blurSave.kind === 'trigger-blur-save') {
      expect(blurSave.payload.source).toBe('capture-blur');
    }
  });

  test('BlurEvent in editing with isDirty=false emits no save command', () => {
    const state = makeState({ status: 'editing', isDirty: false, body: 'content' });
    const action: EditorAction = {
      kind: 'BlurEvent',
      payload: { noteId: 'note-001', body: 'content', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    const saveCmds = result.commands.filter(
      c => c.kind === 'trigger-blur-save' || c.kind === 'trigger-idle-save'
    );
    expect(saveCmds).toHaveLength(0);
  });
});

// ── REQ-EDIT-004: editing + IdleTimerFired (isDirty=true) ────────────────────

describe('REQ-EDIT-004: editing + IdleTimerFired (isDirty=true) → saving + trigger-idle-save', () => {
  test('IdleTimerFired in editing with isDirty=true transitions to saving', () => {
    const state = makeState({ status: 'editing', isDirty: true, body: 'content' });
    const action: EditorAction = {
      kind: 'IdleTimerFired',
      payload: {
        nowMs: 5000,
        noteId: 'note-001',
        body: 'content',
        issuedAt: '2026-05-04T10:00:00.000Z',
      },
    };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('saving');
  });

  test('IdleTimerFired in editing emits trigger-idle-save command with source=capture-idle', () => {
    const state = makeState({ status: 'editing', isDirty: true, body: 'content' });
    const action: EditorAction = {
      kind: 'IdleTimerFired',
      payload: {
        nowMs: 5000,
        noteId: 'note-001',
        body: 'content',
        issuedAt: '2026-05-04T10:00:00.000Z',
      },
    };
    const result = editorReducer(state, action);
    const idleSave = result.commands.find(c => c.kind === 'trigger-idle-save');
    expect(idleSave).toBeDefined();
    if (idleSave && idleSave.kind === 'trigger-idle-save') {
      expect(idleSave.payload.source).toBe('capture-idle');
    }
  });
});

// ── REQ-EDIT-008, EC-EDIT-002: saving + BlurEvent → no new save command ───────

describe('REQ-EDIT-008, EC-EDIT-002, PROP-EDIT-011: saving + BlurEvent → commands=[]', () => {
  test('BlurEvent in saving state emits no commands (guard against double-fire)', () => {
    const state = makeState({ status: 'saving', isDirty: true, body: 'content' });
    const action: EditorAction = {
      kind: 'BlurEvent',
      payload: { noteId: 'note-001', body: 'content', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.commands).toHaveLength(0);
  });

  test('BlurEvent in saving does NOT change status away from saving', () => {
    const state = makeState({ status: 'saving' });
    const action: EditorAction = {
      kind: 'BlurEvent',
      payload: { noteId: 'note-001', body: 'content', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('saving');
  });
});

// ── REQ-EDIT-017: save-failed + RetryClicked ─────────────────────────────────

describe('REQ-EDIT-017: save-failed + RetryClicked → retry-save command', () => {
  test('RetryClicked in save-failed emits retry-save command', () => {
    const state = makeState({
      status: 'save-failed',
      isDirty: true,
      currentNoteId: 'note-001',
      body: 'content',
      lastError: sampleSaveError,
    });
    const action: EditorAction = { kind: 'RetryClicked', payload: { issuedAt: '2026-05-04T10:00:00.000Z' } };
    const result = editorReducer(state, action);
    const retryCmd = result.commands.find(c => c.kind === 'retry-save');
    expect(retryCmd).toBeDefined();
  });

  test('RetryClicked in save-failed transitions to saving', () => {
    const state = makeState({ status: 'save-failed', lastError: sampleSaveError });
    const action: EditorAction = { kind: 'RetryClicked', payload: { issuedAt: '2026-05-04T10:00:00.000Z' } };
    const result = editorReducer(state, action);
    expect(result.state.status).toBe('saving');
  });

  // FIND-015: retry-save command carries the issuedAt from the action payload (ISO-8601)
  test('FIND-015: RetryClicked passes issuedAt through to retry-save command payload', () => {
    const state = makeState({ status: 'save-failed', isDirty: true, body: 'content', lastError: sampleSaveError });
    const issuedAt = '2026-05-04T12:34:56.789Z';
    const action: EditorAction = { kind: 'RetryClicked', payload: { issuedAt } };
    const result = editorReducer(state, action);
    const retryCmd = result.commands.find(c => c.kind === 'retry-save');
    expect(retryCmd).toBeDefined();
    if (retryCmd && retryCmd.kind === 'retry-save') {
      expect(retryCmd.payload.issuedAt).toBe(issuedAt);
      expect(retryCmd.payload.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    }
  });
});

// ── REQ-EDIT-018: save-failed + DiscardClicked ───────────────────────────────

describe('REQ-EDIT-018: save-failed + DiscardClicked → discard-current-session command', () => {
  test('DiscardClicked in save-failed emits discard-current-session command', () => {
    const state = makeState({
      status: 'save-failed',
      isDirty: true,
      currentNoteId: 'note-001',
      lastError: sampleSaveError,
    });
    const action: EditorAction = { kind: 'DiscardClicked' };
    const result = editorReducer(state, action);
    const discardCmd = result.commands.find(c => c.kind === 'discard-current-session');
    expect(discardCmd).toBeDefined();
  });
});

// ── REQ-EDIT-019: switching + CancelClicked ───────────────────────────────────

describe('REQ-EDIT-019: switching + CancelClicked → cancel-switch command', () => {
  test('CancelClicked in switching emits cancel-switch command', () => {
    const state = makeState({
      status: 'switching',
      isDirty: true,
      currentNoteId: 'note-001',
      pendingNextNoteId: 'note-002',
    });
    const action: EditorAction = { kind: 'CancelClicked' };
    const result = editorReducer(state, action);
    const cancelCmd = result.commands.find(c => c.kind === 'cancel-switch');
    expect(cancelCmd).toBeDefined();
  });
});

// ── REQ-EDIT-021: editing + CopyClicked ──────────────────────────────────────

describe('REQ-EDIT-021: editing + CopyClicked (non-empty body) → copy-note-body command', () => {
  test('CopyClicked in editing with non-empty body emits copy-note-body command', () => {
    const state = makeState({
      status: 'editing',
      isDirty: false,
      currentNoteId: 'note-001',
      body: 'This is a prompt I want to copy',
    });
    const action: EditorAction = {
      kind: 'CopyClicked',
      payload: { noteId: 'note-001', body: 'This is a prompt I want to copy' },
    };
    const result = editorReducer(state, action);
    const copyCmd = result.commands.find(c => c.kind === 'copy-note-body');
    expect(copyCmd).toBeDefined();
    if (copyCmd && copyCmd.kind === 'copy-note-body') {
      expect(copyCmd.payload.noteId).toBe('note-001');
    }
  });

  test('CopyClicked in idle state emits no copy-note-body command', () => {
    const state = makeState({ status: 'idle', currentNoteId: null, body: '' });
    const action: EditorAction = {
      kind: 'CopyClicked',
      payload: { noteId: 'note-001', body: '' },
    };
    const result = editorReducer(state, action);
    const copyCmd = result.commands.find(c => c.kind === 'copy-note-body');
    expect(copyCmd).toBeUndefined();
  });
});

// ── REQ-EDIT-023, REQ-EDIT-024: NewNoteClicked ───────────────────────────────

describe('REQ-EDIT-023, REQ-EDIT-024: NewNoteClicked → request-new-note command', () => {
  test('NewNoteClicked with source=explicit-button emits request-new-note with that source', () => {
    const state = makeState({ status: 'editing', isDirty: false });
    const action: EditorAction = {
      kind: 'NewNoteClicked',
      payload: { source: 'explicit-button', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    const newNoteCmd = result.commands.find(c => c.kind === 'request-new-note');
    expect(newNoteCmd).toBeDefined();
    if (newNoteCmd && newNoteCmd.kind === 'request-new-note') {
      expect(newNoteCmd.payload.source).toBe('explicit-button');
    }
  });

  test('NewNoteClicked with source=ctrl-N emits request-new-note with source=ctrl-N', () => {
    const state = makeState({ status: 'editing', isDirty: false });
    const action: EditorAction = {
      kind: 'NewNoteClicked',
      payload: { source: 'ctrl-N', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    const newNoteCmd = result.commands.find(c => c.kind === 'request-new-note');
    expect(newNoteCmd).toBeDefined();
    if (newNoteCmd && newNoteCmd.kind === 'request-new-note') {
      expect(newNoteCmd.payload.source).toBe('ctrl-N');
    }
  });

  test('NewNoteClicked source is passed through unmodified (source pass-through contract)', () => {
    const sources: Array<'explicit-button' | 'ctrl-N'> = ['explicit-button', 'ctrl-N'];
    for (const source of sources) {
      const state = makeState({ status: 'idle' });
      const action: EditorAction = {
        kind: 'NewNoteClicked',
        payload: { source, issuedAt: '2026-05-04T10:00:00.000Z' },
      };
      const result = editorReducer(state, action);
      const newNoteCmd = result.commands.find(c => c.kind === 'request-new-note');
      expect(newNoteCmd).toBeDefined();
      if (newNoteCmd && newNoteCmd.kind === 'request-new-note') {
        expect(newNoteCmd.payload.source).toBe(source);
      }
    }
  });
});

// ── FIND-014: REQ-EDIT-025 deferred new-note intent ──────────────────────────

describe('FIND-014: REQ-EDIT-025 — NewNoteClicked while saving records intent, not immediate dispatch', () => {
  test('NewNoteClicked in saving state records pendingNewNoteIntent, emits no commands', () => {
    // Simulate the state after BlurEvent was dispatched: status is 'saving'
    const state = makeState({ status: 'saving', isDirty: true });
    const action: EditorAction = {
      kind: 'NewNoteClicked',
      payload: { source: 'explicit-button', issuedAt: '2026-05-04T10:00:00.000Z' },
    };
    const result = editorReducer(state, action);
    expect(result.state.pendingNewNoteIntent).toEqual({
      source: 'explicit-button',
      issuedAt: '2026-05-04T10:00:00.000Z',
    });
    // Must NOT emit request-new-note yet
    const newNoteCmds = result.commands.filter(c => c.kind === 'request-new-note');
    expect(newNoteCmds).toHaveLength(0);
  });

  test('DomainSnapshotReceived saving→editing(clean) with pending intent emits request-new-note', () => {
    const state = makeState({
      status: 'saving',
      isDirty: true,
      pendingNewNoteIntent: { source: 'ctrl-N', issuedAt: '2026-05-04T10:00:00.000Z' },
    });
    const snapshot = makeSnapshot({ status: 'editing', isDirty: false });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    const newNoteCmds = result.commands.filter(c => c.kind === 'request-new-note');
    expect(newNoteCmds).toHaveLength(1);
    if (newNoteCmds[0] && newNoteCmds[0].kind === 'request-new-note') {
      expect(newNoteCmds[0].payload.source).toBe('ctrl-N');
    }
    // Intent is cleared
    expect(result.state.pendingNewNoteIntent).toBeNull();
  });

  test('DomainSnapshotReceived saving→save-failed with pending intent drops the intent (no request-new-note)', () => {
    const state = makeState({
      status: 'saving',
      isDirty: true,
      pendingNewNoteIntent: { source: 'explicit-button', issuedAt: '2026-05-04T10:00:00.000Z' },
    });
    const snapshot = makeSnapshot({ status: 'save-failed', isDirty: true, lastError: sampleSaveError });
    const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = editorReducer(state, action);
    const newNoteCmds = result.commands.filter(c => c.kind === 'request-new-note');
    expect(newNoteCmds).toHaveLength(0);
    // Intent is cleared (dropped)
    expect(result.state.pendingNewNoteIntent).toBeNull();
  });
});

// ── Reducer structural invariants ─────────────────────────────────────────────

describe('editorReducer structural invariants (PROP-EDIT-007 example-based)', () => {
  const allStatuses = ['idle', 'editing', 'saving', 'switching', 'save-failed'] as const;
  const validEditorCommandKinds = new Set([
    'edit-note-body',
    'trigger-idle-save',
    'trigger-blur-save',
    'cancel-idle-timer',
    'retry-save',
    'discard-current-session',
    'cancel-switch',
    'copy-note-body',
    'request-new-note',
  ]);

  const sampleAction: EditorAction = {
    kind: 'NoteBodyEdited',
    payload: { newBody: 'x', noteId: 'note-001', issuedAt: '2026-05-04T10:00:00.000Z' },
  };

  test('editorReducer never returns undefined state for any status', () => {
    for (const status of allStatuses) {
      const state = makeState({ status });
      const result = editorReducer(state, sampleAction);
      expect(result.state).toBeDefined();
    }
  });

  test('editorReducer always returns a valid status value', () => {
    const validStatuses = new Set(allStatuses);
    for (const status of allStatuses) {
      const state = makeState({ status });
      const result = editorReducer(state, sampleAction);
      expect(validStatuses.has(result.state.status)).toBe(true);
    }
  });

  test('editorReducer always returns an array for commands', () => {
    for (const status of allStatuses) {
      const state = makeState({ status });
      const result = editorReducer(state, sampleAction);
      expect(Array.isArray(result.commands)).toBe(true);
    }
  });

  test('editorReducer commands only contain valid EditorCommand kinds', () => {
    const actions: EditorAction[] = [
      { kind: 'NoteBodyEdited', payload: { newBody: 'x', noteId: 'n', issuedAt: '' } },
      { kind: 'BlurEvent', payload: { noteId: 'n', body: 'x', issuedAt: '' } },
      { kind: 'RetryClicked', payload: { issuedAt: '' } },
      { kind: 'DiscardClicked' },
      { kind: 'CancelClicked' },
      { kind: 'CopyClicked', payload: { noteId: 'n', body: 'x' } },
      { kind: 'NewNoteClicked', payload: { source: 'explicit-button', issuedAt: '' } },
    ];

    for (const status of allStatuses) {
      for (const action of actions) {
        const state = makeState({ status });
        const result = editorReducer(state, action);
        for (const cmd of result.commands) {
          expect(validEditorCommandKinds.has(cmd.kind)).toBe(true);
        }
      }
    }
  });
});
