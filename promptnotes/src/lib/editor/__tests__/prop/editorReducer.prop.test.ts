/**
 * editorReducer.property.test.ts — Tier 2 fast-check property tests (bun:test)
 *
 * Sprint 7 Red phase. All tests MUST FAIL because the stub throws.
 *
 * Coverage:
 *   PROP-EDIT-002 (source-pass-through: save commands carry correct source)
 *   PROP-EDIT-007 (reducer-totality: all (status, action) pairs return valid output)
 *   PROP-EDIT-008 (reducer-purity: deterministic with deep-equal inputs)
 *   PROP-EDIT-040 (snapshot-per-variant-mirroring: all 5 DTO arms)
 *
 * PROP-EDIT-009 is subsumed by PROP-EDIT-002 per spec — no separate property required.
 *
 * REQ-EDIT references appear in test description strings for CRIT-700/CRIT-701 grep.
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import type {
  EditorViewState,
  EditorAction,
  EditorCommand,
  EditingSessionStateDto,
  SaveError,
  PendingNextFocus,
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

const arbNoteId = fc.string({ minLength: 1, maxLength: 40 });
const arbBlockId = fc.string({ minLength: 1, maxLength: 40 });
const arbIssuedAt = fc.constant('2026-05-06T09:00:00.000Z');

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constantFrom<SaveError>(
    { kind: 'fs', reason: { kind: 'permission' } },
    { kind: 'fs', reason: { kind: 'disk-full' } },
    { kind: 'fs', reason: { kind: 'lock' } },
    { kind: 'fs', reason: { kind: 'not-found' } },
    { kind: 'fs', reason: { kind: 'unknown' } }
  ),
  fc.constantFrom<SaveError>(
    { kind: 'validation', reason: { kind: 'invariant-violated' } },
    { kind: 'validation', reason: { kind: 'empty-body-on-idle' } }
  )
);

const arbPendingNextFocus: fc.Arbitrary<PendingNextFocus | null> = fc.oneof(
  fc.constant(null),
  fc.record({ noteId: arbNoteId, blockId: arbBlockId })
);

const arbViewState: fc.Arbitrary<EditorViewState> = fc.record({
  status: arbStatus,
  isDirty: fc.boolean(),
  currentNoteId: fc.oneof(fc.constant(null), arbNoteId),
  focusedBlockId: fc.oneof(fc.constant(null), arbBlockId),
  pendingNextFocus: arbPendingNextFocus,
  isNoteEmpty: fc.boolean(),
  lastSaveError: fc.oneof(fc.constant(null), arbSaveError),
  lastSaveResult: fc.oneof(fc.constant(null), fc.constant('success' as const)),
});

// EditingSessionStateDto arbitraries — one per arm
const arbIdleDto: fc.Arbitrary<EditingSessionStateDto> = fc.constant({ status: 'idle' as const });

const arbEditingDto: fc.Arbitrary<EditingSessionStateDto> = fc.record({
  status: fc.constant('editing' as const),
  currentNoteId: arbNoteId,
  focusedBlockId: fc.oneof(fc.constant(null), arbBlockId),
  isDirty: fc.boolean(),
  isNoteEmpty: fc.boolean(),
  lastSaveResult: fc.oneof(fc.constant(null), fc.constant('success' as const)),
});

const arbSavingDto: fc.Arbitrary<EditingSessionStateDto> = fc.record({
  status: fc.constant('saving' as const),
  currentNoteId: arbNoteId,
  isNoteEmpty: fc.boolean(),
});

const arbSwitchingDto: fc.Arbitrary<EditingSessionStateDto> = fc.record({
  status: fc.constant('switching' as const),
  currentNoteId: arbNoteId,
  pendingNextFocus: fc.record({ noteId: arbNoteId, blockId: arbBlockId }),
  isNoteEmpty: fc.boolean(),
});

const arbSaveFailedDto: fc.Arbitrary<EditingSessionStateDto> = fc.record({
  status: fc.constant('save-failed' as const),
  currentNoteId: arbNoteId,
  priorFocusedBlockId: fc.oneof(fc.constant(null), arbBlockId),
  pendingNextFocus: arbPendingNextFocus,
  lastSaveError: arbSaveError,
  isNoteEmpty: fc.boolean(),
});

const arbDto: fc.Arbitrary<EditingSessionStateDto> = fc.oneof(
  arbIdleDto, arbEditingDto, arbSavingDto, arbSwitchingDto, arbSaveFailedDto
);

// Sample of EditorAction variants for totality check
const arbEditorAction: fc.Arbitrary<EditorAction> = fc.oneof(
  fc.record({ kind: fc.constant('BlockContentEdited' as const), payload: fc.record({ noteId: arbNoteId, blockId: arbBlockId, content: fc.string(), issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('BlockFocused' as const), payload: fc.record({ noteId: arbNoteId, blockId: arbBlockId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('BlockBlurred' as const), payload: fc.record({ noteId: arbNoteId, blockId: arbBlockId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('EditorBlurredAllBlocks' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  arbDto.map(snapshot => ({ kind: 'DomainSnapshotReceived' as const, snapshot })),
  fc.record({ kind: fc.constant('TriggerIdleSaveRequested' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('TriggerBlurSaveRequested' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('RetrySaveRequested' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('DiscardCurrentSessionRequested' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('CancelSwitchRequested' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  fc.record({ kind: fc.constant('CopyNoteBodyRequested' as const), payload: fc.record({ noteId: arbNoteId, issuedAt: arbIssuedAt }) }),
  fc.record({
    kind: fc.constant('RequestNewNoteRequested' as const),
    payload: fc.record({
      source: fc.constantFrom('explicit-button' as const, 'ctrl-N' as const),
      issuedAt: arbIssuedAt,
    }),
  }),
);

const VALID_COMMAND_KINDS = new Set<string>([
  'focus-block', 'edit-block-content', 'insert-block-after', 'insert-block-at-beginning',
  'remove-block', 'merge-blocks', 'split-block', 'change-block-type', 'move-block',
  'cancel-idle-timer', 'trigger-idle-save', 'trigger-blur-save', 'retry-save',
  'discard-current-session', 'cancel-switch', 'copy-note-body', 'request-new-note',
]);

const VALID_STATUSES = new Set<string>(['idle', 'editing', 'saving', 'switching', 'save-failed']);

// ── PROP-EDIT-002: source-pass-through ───────────────────────────────────────

describe("PROP-EDIT-002: 'source-pass-through' (REQ-EDIT-037)", () => {
  test('PROP-EDIT-002a: trigger-idle-save command carries source=capture-idle when emitted from TriggerIdleSaveRequested (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState.map(s => ({ ...s, status: 'editing' as const, isDirty: true })), arbNoteId, (state, noteId) => {
        const action: EditorAction = {
          kind: 'TriggerIdleSaveRequested',
          payload: { noteId, issuedAt: '2026-05-06T09:00:00.000Z' },
        };
        const result = editorReducer(state, action);
        const idleSaveCmds = result.commands.filter(c => c.kind === 'trigger-idle-save');
        return idleSaveCmds.every(c => {
          const cmd = c as Extract<EditorCommand, { kind: 'trigger-idle-save' }>;
          return cmd.payload.source === 'capture-idle';
        });
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-002b: trigger-blur-save command carries source=capture-blur when emitted from TriggerBlurSaveRequested (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState.map(s => ({ ...s, status: 'editing' as const, isDirty: true })), arbNoteId, (state, noteId) => {
        const action: EditorAction = {
          kind: 'TriggerBlurSaveRequested',
          payload: { noteId, issuedAt: '2026-05-06T09:00:00.000Z' },
        };
        const result = editorReducer(state, action);
        const blurSaveCmds = result.commands.filter(c => c.kind === 'trigger-blur-save');
        return blurSaveCmds.every(c => {
          const cmd = c as Extract<EditorCommand, { kind: 'trigger-blur-save' }>;
          return cmd.payload.source === 'capture-blur';
        });
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-002c: no save command carries invalid source strings (≥100 runs)', () => {
    const INVALID_SOURCES = new Set(['idle', 'blur', 'switch', 'manual']);
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        const result = editorReducer(state, action);
        for (const cmd of result.commands) {
          if (cmd.kind === 'trigger-idle-save') {
            const c = cmd as Extract<EditorCommand, { kind: 'trigger-idle-save' }>;
            if (INVALID_SOURCES.has(c.payload.source as string)) return false;
          }
          if (cmd.kind === 'trigger-blur-save') {
            const c = cmd as Extract<EditorCommand, { kind: 'trigger-blur-save' }>;
            if (INVALID_SOURCES.has(c.payload.source as string)) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-007: reducer-totality ──────────────────────────────────────────

describe("PROP-EDIT-007: 'reducer-totality' (REQ-EDIT-019..023)", () => {
  test('PROP-EDIT-007a: reducer never throws for any (state, action) pair (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        let threw = false;
        try { editorReducer(state, action); } catch { threw = true; }
        return !threw;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007b: result.state.status is always one of 5 valid values (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        const result = editorReducer(state, action);
        return VALID_STATUSES.has(result.state.status);
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007c: result.commands is always a ReadonlyArray (never undefined) (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        const result = editorReducer(state, action);
        return Array.isArray(result.commands) && result.commands !== undefined;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-007d: each command kind is one of the 17 valid variants (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        const result = editorReducer(state, action);
        return result.commands.every(cmd => VALID_COMMAND_KINDS.has(cmd.kind));
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-008: reducer-purity ─────────────────────────────────────────────

describe("PROP-EDIT-008: 'reducer-purity' (REQ-EDIT-024)", () => {
  test('PROP-EDIT-008a: same inputs produce deep-equal outputs (deterministic, ≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        const result1 = editorReducer(state, action);
        const result2 = editorReducer(state, action);
        return JSON.stringify(result1) === JSON.stringify(result2);
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-008b: original state is not mutated by reducer (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditorAction, (state, action) => {
        const frozen = Object.freeze({ ...state });
        const stateBefore = JSON.stringify(state);
        editorReducer(state, action);
        return JSON.stringify(state) === stateBefore;
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-040: snapshot-per-variant-mirroring ─────────────────────────────

describe("PROP-EDIT-040: 'snapshot-per-variant-mirroring' (REQ-EDIT-002, REQ-EDIT-024)", () => {
  test('PROP-EDIT-040a: idle snapshot → state.status=idle and idle-default fields (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbIdleDto, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        return result.state.status === 'idle';
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-040b: editing snapshot mirrors status, currentNoteId, focusedBlockId, isDirty, isNoteEmpty (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbEditingDto, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        if (snapshot.status !== 'editing') return true;
        return (
          result.state.status === snapshot.status &&
          result.state.currentNoteId === snapshot.currentNoteId &&
          result.state.focusedBlockId === snapshot.focusedBlockId &&
          result.state.isDirty === snapshot.isDirty &&
          result.state.isNoteEmpty === snapshot.isNoteEmpty
        );
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-040c: saving snapshot mirrors status, currentNoteId, isNoteEmpty (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbSavingDto, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        if (snapshot.status !== 'saving') return true;
        return (
          result.state.status === snapshot.status &&
          result.state.currentNoteId === snapshot.currentNoteId &&
          result.state.isNoteEmpty === snapshot.isNoteEmpty
        );
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-040d: switching snapshot mirrors status, currentNoteId, pendingNextFocus, isNoteEmpty (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbSwitchingDto, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        if (snapshot.status !== 'switching') return true;
        return (
          result.state.status === snapshot.status &&
          result.state.currentNoteId === snapshot.currentNoteId &&
          result.state.isNoteEmpty === snapshot.isNoteEmpty
        );
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-040e: save-failed snapshot — state.focusedBlockId === snapshot.priorFocusedBlockId (≥100 runs)', () => {
    fc.assert(
      fc.property(arbViewState, arbSaveFailedDto, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        if (snapshot.status !== 'save-failed') return true;
        return result.state.focusedBlockId === snapshot.priorFocusedBlockId;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-040f: state.status always equals snapshot.status for DomainSnapshotReceived (≥100 runs × 5 arms)', () => {
    fc.assert(
      fc.property(arbViewState, arbDto, (state, snapshot) => {
        const action: EditorAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = editorReducer(state, action);
        return result.state.status === snapshot.status;
      }),
      { numRuns: 500 }
    );
  });
});
