// app-startup/initialize-capture.ts
// Step 4: Initialize capture session — allocate NoteId, emit events,
//   build InitialUIState carrying the seeded EditingSessionState.
//
// REQ-010: initializeCaptureSession creates new note and editing session.
// REQ-011: NoteId uniqueness invariant (via nextAvailableNoteId pure helper).
// REQ-012: Events emitted — NewNoteAutoCreated then EditorFocusedOnNewNote.
// REQ-014: Post-condition — InitialUIState shape (FIND-001: editingSessionState).
// PROP-003: nextAvailableNoteId returns NoteId not in existingIds (required: true).
// PROP-013: InitialUIState has feed, tagInventory, corruptedFiles, editingSessionState.
// PROP-022: nextAvailableNoteId is deterministic.
// FIND-002: noteCreate port wraps Note.create(id, now) with empty Body.

import type { NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { HydratedFeed, InitialUIState } from "./stages.js";

// ── Port definitions ────────────────────────────────────────────────────────

export type InitializeCaptureSessionPorts = {
  /** Obtain current wall-clock time. Effectful — not pure. */
  readonly clockNow: () => Timestamp;
  /** Allocate a collision-free NoteId based on the current time. */
  readonly allocateNoteId: (now: Timestamp) => NoteId;
  /**
   * FIND-002: Construct an empty Note via the Note aggregate's `create`
   * Smart Constructor. The implementation must call this exactly once with
   * the allocated NoteId and the Clock.now timestamp; the returned Note
   * carries an empty Body and createdAt === updatedAt === now.
   */
  readonly noteCreate: (id: NoteId, now: Timestamp) => Note;
  /** Emit a domain event to the application event bus. */
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

// ── Step 4 implementation ───────────────────────────────────────────────────

/**
 * Step 4 of the AppStartup pipeline.
 *
 * Effectful: calls Clock, emits two Capture-internal events, returns
 * InitialUIState carrying the allocated NoteId.
 * REQ-012 AC: NewNoteAutoCreated is emitted BEFORE EditorFocusedOnNewNote.
 */
export async function initializeCaptureSession(
  hydrated: HydratedFeed,
  ports: InitializeCaptureSessionPorts
): Promise<InitialUIState> {
  // REQ-010: obtain current wall-clock time and allocate a collision-free
  // NoteId for the session-start auto-created note.
  const now = ports.clockNow();
  const noteId = ports.allocateNoteId(now);

  // FIND-002 / REQ-010: invoke Note.create through the noteCreate port.
  // Step 4 does not consume the resulting aggregate — id-seeded UI state is
  // sufficient — but downstream subscribers of NewNoteAutoCreated rely on the
  // aggregate having been constructed by this call.
  ports.noteCreate(noteId, now);

  // REQ-012: emit NewNoteAutoCreated, then EditorFocusedOnNewNote.
  emitCaptureSessionStartEvents(ports.emit, noteId, now);

  // FIND-001 / REQ-014: return InitialUIState with the EditingState branch
  // of EditingSessionState seeded by the allocated NoteId.
  return {
    kind: "InitialUIState",
    feed: hydrated.feed,
    tagInventory: hydrated.tagInventory,
    corruptedFiles: hydrated.corruptedFiles,
    editingSessionState: makeEditingState(noteId),
  };
}

// ── Pure helper: nextAvailableNoteId ───────────────────────────────────────

/**
 * Pure, deterministic helper — PROP-003 / PROP-022.
 *
 * Computes a NoteId string from the preferred Timestamp that is not present
 * in existingIds. If the base string collides, appends -1, -2, ... until free.
 *
 * Format: YYYY-MM-DD-HHmmss-SSS (UTC) with optional -N collision suffix.
 * Function arity is exactly 2 (no default params, no rest args).
 */
export function nextAvailableNoteId(
  preferred: Timestamp,
  existingIds: ReadonlySet<NoteId>
): NoteId {
  const epochMillis = (preferred as unknown as { epochMillis: number }).epochMillis;
  const base = formatBaseId(epochMillis);

  if (!existingIds.has(base as unknown as NoteId)) {
    return base as unknown as NoteId;
  }

  // Collision: try -1, -2, ... until a free slot is found.
  for (let i = 1; ; i++) {
    const candidate = `${base}-${i}`;
    if (!existingIds.has(candidate as unknown as NoteId)) {
      return candidate as unknown as NoteId;
    }
  }
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Format epoch milliseconds as a NoteId base string: YYYY-MM-DD-HHmmss-SSS (UTC).
 * Pure — no Date.now(), deterministic for any fixed input.
 */
function formatBaseId(epochMillis: number): string {
  const d = new Date(epochMillis);
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const pad3 = (n: number): string => String(n).padStart(3, "0");

  const Y = d.getUTCFullYear();
  const M = pad2(d.getUTCMonth() + 1);
  const D = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const m = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  const ms = pad3(d.getUTCMilliseconds());

  return `${Y}-${M}-${D}-${h}${m}${s}-${ms}`;
}

/**
 * REQ-010 / FIND-001: build the EditingState branch of EditingSessionState
 * for a fresh session-start note. All transient editing fields start blank.
 */
function makeEditingState(noteId: NoteId): EditingState {
  return {
    status: "editing",
    currentNoteId: noteId,
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
}

/**
 * REQ-012: emit the two Capture-internal events in the required order —
 * NewNoteAutoCreated MUST precede EditorFocusedOnNewNote.
 */
function emitCaptureSessionStartEvents(
  emit: InitializeCaptureSessionPorts["emit"],
  noteId: NoteId,
  now: Timestamp
): void {
  emit({ kind: "new-note-auto-created", noteId, occurredOn: now });
  emit({ kind: "editor-focused-on-new-note", noteId, occurredOn: now });
}
