// app-startup/initialize-capture.ts
// Step 4: Initialize capture session — allocate NoteId, emit events, build InitialUIState.
//
// REQ-010: initializeCaptureSession creates new note and editing session.
// REQ-011: NoteId uniqueness invariant (via nextAvailableNoteId pure helper).
// REQ-012: Events emitted — NewNoteAutoCreated then EditorFocusedOnNewNote.
// REQ-014: Post-condition — InitialUIState shape.
// PROP-003: nextAvailableNoteId returns NoteId not in existingIds (required: true).
// PROP-013: InitialUIState has feed, tagInventory, corruptedFiles, initialNoteId.
// PROP-022: nextAvailableNoteId is deterministic.

import type { NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { HydratedFeed, InitialUIState } from "./stages.js";

// ── Port definitions ────────────────────────────────────────────────────────

export type InitializeCaptureSessionPorts = {
  /** Obtain current wall-clock time. Effectful — not pure. */
  readonly clockNow: () => Timestamp;
  /** Allocate a collision-free NoteId based on the current time. */
  readonly allocateNoteId: (now: Timestamp) => NoteId;
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
  // REQ-010: obtain current timestamp from clock port.
  const now = ports.clockNow();

  // REQ-010: allocate a collision-free NoteId via the effectful allocator port.
  const noteId = ports.allocateNoteId(now);

  // REQ-012: emit NewNoteAutoCreated first.
  ports.emit({
    kind: "new-note-auto-created",
    noteId,
    occurredOn: now,
  });

  // REQ-012: emit EditorFocusedOnNewNote after.
  ports.emit({
    kind: "editor-focused-on-new-note",
    noteId,
    occurredOn: now,
  });

  // REQ-014: build and return InitialUIState.
  return {
    kind: "InitialUIState",
    feed: hydrated.feed,
    tagInventory: hydrated.tagInventory,
    corruptedFiles: hydrated.corruptedFiles,
    initialNoteId: noteId,
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
