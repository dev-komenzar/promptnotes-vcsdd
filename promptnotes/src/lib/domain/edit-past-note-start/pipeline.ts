// edit-past-note-start/pipeline.ts
// Full EditPastNoteStart pipeline — orchestrates the 3-step workflow.
//
// REQ-EPNS-001..012: Complete workflow
// PROP-EPNS-005: SwitchError exhaustiveness
// PROP-EPNS-013: Clock.now() budget ≤ 2 per workflow invocation
// FIND-002: Pass isEmpty port through to classifyCurrentSession
// FIND-003: Same-note guard returns SameNoteNoOp, not NewSession

import type { Result } from "promptnotes-domain-types/util/result";
import type {
  NoteId,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { SaveError, SwitchError } from "promptnotes-domain-types/shared/errors";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type { EditingSessionState } from "promptnotes-domain-types/capture/states";
import type {
  PastNoteSelection,
  NewSession,
} from "promptnotes-domain-types/capture/stages";

import { classifyCurrentSession } from "./classify-current-session.js";
import { flushCurrentSession } from "./flush-current-session.js";
import { startNewSession } from "./start-new-session.js";

// ── Port definitions ────────────────────────────────────────────────────

export type EditPastNoteStartPorts = {
  readonly clockNow: () => Timestamp;
  readonly blurSave: (
    noteId: NoteId,
    note: Note,
    previousFrontmatter: Frontmatter | null,
  ) => Result<NoteFileSaved, SaveError>;
  readonly hydrateSnapshot: (snapshot: NoteFileSnapshot) => Note;
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

// ── Pipeline input ──────────────────────────────────────────────────────

export type EditPastNoteStartInput = {
  readonly selection: PastNoteSelection;
  readonly currentState: EditingSessionState;
  readonly currentNote: Note | null;
  readonly previousFrontmatter: Frontmatter | null;
};

// ── Result types ────────────────────────────────────────────────────────

/** FIND-003: Same-note re-selection returns this instead of NewSession */
export type SameNoteNoOp = {
  readonly kind: "SameNoteNoOp";
  readonly noteId: NoteId;
};

export type EditPastNoteStartResult = NewSession | SameNoteNoOp;

// ── Pipeline implementation ─────────────────────────────────────────────

/**
 * Orchestrates the EditPastNoteStart workflow:
 *
 * 1. Pre-pipeline guard: same-note re-selection → emit EditorFocusedOnPastNote, return SameNoteNoOp
 * 2. classifyCurrentSession (pure) → CurrentSessionDecision
 * 3. flushCurrentSession → FlushedCurrentSession or SwitchError
 * 4. startNewSession → NewSession
 */
export function runEditPastNoteStartPipeline(
  input: EditPastNoteStartInput,
  ports: EditPastNoteStartPorts,
): Result<EditPastNoteStartResult, SwitchError> {
  const { selection, currentState, currentNote, previousFrontmatter } = input;

  // ── Pre-pipeline guard: same-note re-selection (REQ-EPNS-005) ─────────
  const currentNoteId = getCurrentNoteId(currentState);
  if (currentNoteId !== null && currentNoteId === selection.noteId) {
    // Same note → no-op, just emit focus event
    // FIND-003: Return SameNoteNoOp instead of NewSession
    const now = ports.clockNow();
    ports.emit({
      kind: "editor-focused-on-past-note",
      noteId: selection.noteId,
      occurredOn: now,
    });
    return {
      ok: true,
      value: { kind: "SameNoteNoOp", noteId: selection.noteId },
    };
  }

  // ── Step 1: classify current session (pure) ───────────────────────────
  const decision = classifyCurrentSession(currentState, currentNote);

  // ── Step 2: flush current session ─────────────────────────────────────
  const flushResult = flushCurrentSession(
    decision,
    selection.noteId,
    {
      clockNow: ports.clockNow,
      blurSave: ports.blurSave,
      emit: ports.emit,
    },
    previousFrontmatter,
  );

  if (!flushResult.ok) {
    return flushResult;
  }

  // ── Step 3: start new session ─────────────────────────────────────────
  const newSession = startNewSession(selection, {
    clockNow: ports.clockNow,
    hydrateSnapshot: ports.hydrateSnapshot,
    emit: ports.emit,
  });

  return { ok: true, value: newSession };
}

/** Extract currentNoteId from state (null for IdleState) */
function getCurrentNoteId(state: EditingSessionState): NoteId | null {
  if (state.status === "idle") return null;
  return state.currentNoteId;
}
