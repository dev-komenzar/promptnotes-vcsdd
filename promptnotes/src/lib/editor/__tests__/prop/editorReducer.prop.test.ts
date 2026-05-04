/**
 * editorReducer.prop.test.ts — Tier 2 property tests (bun:test + fast-check)
 *
 * Coverage:
 *   PROP-EDIT-007 (reducer totality)
 *   PROP-EDIT-008 (referential transparency)
 *   PROP-EDIT-002 (source pass-through)
 *   PROP-EDIT-040 (DomainSnapshotReceived identity over state fields)
 *   REQ-EDIT-014, REQ-EDIT-026
 *
 * RED PHASE: editorReducer stub throws — all fc.assert calls produce FAIL.
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import type {
  EditorViewState,
  EditorAction,
  EditingSessionState,
  SaveError,
  NewNoteSource,
} from '$lib/editor/types';
import { editorReducer } from '$lib/editor/editorReducer';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbStatus = fc.constantFrom(
  'idle' as const,
  'editing' as const,
  'saving' as const,
  'switching' as const,
  'save-failed' as const
);

const arbSaveSource = fc.constantFrom('capture-idle' as const, 'capture-blur' as const);

const arbNewNoteSource = fc.constantFrom<NewNoteSource>('explicit-button', 'ctrl-N');

const arbNoteId = fc.string({ minLength: 1, maxLength: 50 });
const arbBody = fc.string();
const arbIssuedAt = fc.constant('2026-05-04T10:00:00.000Z');

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constantFrom<SaveError>(
    { kind: 'fs', reason: { kind: 'permission' } },
    { kind: 'fs', reason: { kind: 'disk-full' } },
    { kind: 'fs', reason: { kind: 'lock' } },
    { kind: 'fs', reason: { kind: 'unknown' } }
  ),
  fc.constantFrom<SaveError>(
    { kind: 'validation', reason: { kind: 'invariant-violated' } },
    { kind: 'validation', reason: { kind: 'empty-body-on-idle' } }
  )
);

const arbPendingNewNoteIntent: fc.Arbitrary<{ source: NewNoteSource; issuedAt: string } | null> =
  fc.oneof(
    fc.constant(null),
    fc.record({
      source: arbNewNoteSource,
      issuedAt: arbIssuedAt,
    })
  );

const arbViewState: fc.Arbitrary<EditorViewState> = fc.record({
  status: arbStatus,
  isDirty: fc.boolean(),
  currentNoteId: fc.oneof(fc.constant(null), arbNoteId),
  body: arbBody,
  pendingNextNoteId: fc.oneof(fc.constant(null), arbNoteId),
  lastError: fc.oneof(fc.constant(null), arbSaveError),
  pendingNewNoteIntent: arbPendingNewNoteIntent,
});

const arbSnapshotState: fc.Arbitrary<EditingSessionState> = fc.record({
  status: arbStatus,
  isDirty: fc.boolean(),
  currentNoteId: fc.oneof(fc.constant(null), arbNoteId),
  body: arbBody,
  pendingNextNoteId: fc.oneof(fc.constant(null), arbNoteId),
  lastError: fc.oneof(fc.constant(null), arbSaveError),
});

/** All 11 EditorAction variants. */
const arbAction: fc.Arbitrary<EditorAction> = fc.oneof(
  fc.record({
    kind: fc.constant('NoteBodyEdited' as const),
    payload: fc.record({
      newBody: arbBody,
      noteId: arbNoteId,
      issuedAt: arbIssuedAt,
    }),
  }),
  fc.record({
    kind: fc.constant('BlurEvent' as const),
    payload: fc.record({
      noteId: arbNoteId,
      body: arbBody,
      issuedAt: arbIssuedAt,
    }),
  }),
  fc.record({
    kind: fc.constant('IdleTimerFired' as const),
    payload: fc.record({
      nowMs: fc.integer({ min: 0, max: 1_000_000 }),
      noteId: arbNoteId,
      body: arbBody,
      issuedAt: arbIssuedAt,
    }),
  }),
  fc.record({
    kind: fc.constant('DomainSnapshotReceived' as const),
    snapshot: arbSnapshotState,
  }),
  fc.record({
    kind: fc.constant('NoteFileSaved' as const),
    payload: fc.record({
      noteId: arbNoteId,
      savedAt: arbIssuedAt,
    }),
  }),
  fc.record({
    kind: fc.constant('NoteSaveFailed' as const),
    payload: fc.record({
      noteId: arbNoteId,
      error: arbSaveError,
    }),
  }),
  fc.record({
    kind: fc.constant('RetryClicked' as const),
    payload: fc.record({ issuedAt: arbIssuedAt }),
  }),
  fc.constant({ kind: 'DiscardClicked' as const }),
  fc.constant({ kind: 'CancelClicked' as const }),
  fc.record({
    kind: fc.constant('CopyClicked' as const),
    payload: fc.record({
      noteId: arbNoteId,
      body: arbBody,
    }),
  }),
  fc.record({
    kind: fc.constant('NewNoteClicked' as const),
    payload: fc.record({
      source: arbNewNoteSource,
      issuedAt: arbIssuedAt,
    }),
  })
);

/** Save-triggering actions that must carry source in their commands. */
const arbSaveTriggerAction: fc.Arbitrary<EditorAction> = fc.oneof(
  fc.record({
    kind: fc.constant('BlurEvent' as const),
    payload: fc.record({
      noteId: arbNoteId,
      body: arbBody,
      issuedAt: arbIssuedAt,
    }),
  }),
  fc.record({
    kind: fc.constant('IdleTimerFired' as const),
    payload: fc.record({
      nowMs: fc.integer({ min: 0, max: 1_000_000 }),
      noteId: arbNoteId,
      body: arbBody,
      issuedAt: arbIssuedAt,
    }),
  })
);

const validCommandKinds = new Set([
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

const validStatuses = new Set([
  'idle', 'editing', 'saving', 'switching', 'save-failed',
]);

// ── PROP-EDIT-007: Reducer totality ───────────────────────────────────────────

describe('PROP-EDIT-007 (fast-check): reducer totality over all (status, action) pairs', () => {
  test('PROP-EDIT-007a: never returns undefined state (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        const result = editorReducer(state, action);
        return result.state !== undefined && result.state !== null;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007b: returned status is always in the 5-value enum (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        const result = editorReducer(state, action);
        return validStatuses.has(result.state.status);
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007c: commands is always a defined array (never undefined) (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        const result = editorReducer(state, action);
        return Array.isArray(result.commands);
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007d: every commands[i].kind is in the 9-variant EditorCommand union (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        const result = editorReducer(state, action);
        return result.commands.every(cmd => validCommandKinds.has(cmd.kind));
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007e: reducer never throws (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        let threw = false;
        try {
          editorReducer(state, action);
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007f: isDirty transitions: editing+NoteBodyEdited→true, saving+NoteFileSaved→false (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbNoteId,
        arbBody,
        arbIssuedAt,
        (noteId, newBody, issuedAt) => {
          // editing + NoteBodyEdited → isDirty=true
          const editingState: EditorViewState = {
            status: 'editing',
            isDirty: false,
            currentNoteId: noteId,
            body: '',
            pendingNextNoteId: null,
            lastError: null,
            pendingNewNoteIntent: null,
          };
          const editResult = editorReducer(editingState, {
            kind: 'NoteBodyEdited',
            payload: { newBody, noteId, issuedAt },
          });

          // saving + NoteFileSaved → isDirty=false
          const savingState: EditorViewState = {
            status: 'saving',
            isDirty: true,
            currentNoteId: noteId,
            body: newBody,
            pendingNextNoteId: null,
            lastError: null,
            pendingNewNoteIntent: null,
          };
          const saveResult = editorReducer(savingState, {
            kind: 'NoteFileSaved',
            payload: { noteId, savedAt: issuedAt },
          });

          return editResult.state.isDirty === true && saveResult.state.isDirty === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-008: Referential transparency ───────────────────────────────────

describe('PROP-EDIT-008 (fast-check): reducer is referentially transparent', () => {
  test('calling editorReducer twice with equal (state, action) produces deep-equal results (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        const result1 = editorReducer(state, action);
        const result2 = editorReducer(state, action);
        return (
          JSON.stringify(result1.state) === JSON.stringify(result2.state) &&
          JSON.stringify(result1.commands) === JSON.stringify(result2.commands)
        );
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-002: Source pass-through ───────────────────────────────────────

describe('PROP-EDIT-002 (fast-check): save command source equals action payload source', () => {
  test('PROP-EDIT-002a: trigger-blur-save source equals the source that caused the save (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbViewState.filter(s => s.status === 'editing' && s.isDirty),
        arbNoteId,
        arbBody,
        arbIssuedAt,
        (state, noteId, body, issuedAt) => {
          const action: EditorAction = {
            kind: 'BlurEvent',
            payload: { noteId, body, issuedAt },
          };
          const result = editorReducer(state, action);
          const saveCmd = result.commands.find(
            c => c.kind === 'trigger-blur-save' || c.kind === 'trigger-idle-save'
          );
          if (!saveCmd) return true; // no save emitted — predicate vacuously holds
          if (saveCmd.kind === 'trigger-blur-save') {
            return saveCmd.payload.source === 'capture-blur';
          }
          if (saveCmd.kind === 'trigger-idle-save') {
            return saveCmd.payload.source === 'capture-idle';
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-002b: save source is always in EditorCommandSaveSource (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbSaveTriggerAction, (state, action) => {
        const result = editorReducer(state, action);
        const saveCmds = result.commands.filter(
          c => c.kind === 'trigger-idle-save' || c.kind === 'trigger-blur-save'
        );
        return saveCmds.every(cmd => {
          if (cmd.kind === 'trigger-idle-save') {
            return cmd.payload.source === 'capture-idle';
          }
          if (cmd.kind === 'trigger-blur-save') {
            return cmd.payload.source === 'capture-blur';
          }
          return false;
        });
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-002c: no save command carries invalid source strings (≥100 runs)', () => {
    const invalidSources = new Set(['idle', 'blur', 'switch', 'manual', 'curate-tag-chip']);
    fc.assert(
      fc.property(arbViewState, arbAction, (state, action) => {
        const result = editorReducer(state, action);
        return result.commands.every(cmd => {
          if (cmd.kind === 'trigger-idle-save' || cmd.kind === 'trigger-blur-save') {
            return !invalidSources.has(cmd.payload.source);
          }
          return true;
        });
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-040: DomainSnapshotReceived is identity over 4 fields ───────────

describe('PROP-EDIT-040 (fast-check): DomainSnapshotReceived is identity over state fields', () => {
  test('snapshot mirroring is identity over state fields (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbSnapshotState, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        return (
          result.state.status === snapshot.status &&
          result.state.isDirty === snapshot.isDirty &&
          result.state.currentNoteId === snapshot.currentNoteId &&
          result.state.pendingNextNoteId === snapshot.pendingNextNoteId
        );
      }),
      { numRuns: 100 }
    );
  });

  // FIND-017: DomainSnapshotReceived may emit cancel-idle-timer (when isDirty=false)
  // and request-new-note (when draining a pending intent on save-success).
  // The property is: emitted commands are only from the allowed set.
  test('DomainSnapshotReceived emits only allowed commands for any (state, snapshot) pair (≥100 runs)', () => {
    const allowedKinds = new Set(['cancel-idle-timer', 'request-new-note']);
    fc.assert(
      fc.property(arbViewState, arbSnapshotState, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        return result.commands.every(cmd => allowedKinds.has(cmd.kind));
      }),
      { numRuns: 100 }
    );
  });

  // FIND-017: cancel-idle-timer is emitted IFF snapshot.isDirty=false
  test('FIND-017: cancel-idle-timer emitted iff snapshot.isDirty=false (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbSnapshotState, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        const hasCancelTimer = result.commands.some(c => c.kind === 'cancel-idle-timer');
        return hasCancelTimer === !snapshot.isDirty;
      }),
      { numRuns: 100 }
    );
  });
});
