// edit-past-note-start/start-new-session.ts
// Step 3: Hydrate snapshot and create new editing session.
//
// REQ-EPNS-008: Hydrate snapshot → NewSession, transition EditingSessionState
// REQ-EPNS-010: Emit EditorFocusedOnPastNote
// REQ-EPNS-012: Clock.now() called exactly once

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type {
  PastNoteSelection,
  NewSession,
} from "promptnotes-domain-types/capture/stages";

export type StartNewSessionPorts = {
  readonly clockNow: () => Timestamp;
  readonly hydrateSnapshot: (snapshot: NoteFileSnapshot) => Note;
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

/**
 * Hydrate the selected snapshot into a Note and create a NewSession.
 * Emits EditorFocusedOnPastNote as the final event.
 * Clock.now() is called exactly once.
 */
export function startNewSession(
  selection: PastNoteSelection,
  ports: StartNewSessionPorts,
): NewSession {
  // REQ-EPNS-012: exactly one Clock.now() call
  const now = ports.clockNow();

  // REQ-EPNS-008: hydrate snapshot
  const note = ports.hydrateSnapshot(selection.snapshot);

  const newSession: NewSession = {
    kind: "NewSession",
    noteId: selection.noteId,
    note,
    startedAt: now,
  };

  // REQ-EPNS-010: emit EditorFocusedOnPastNote (Capture-internal)
  ports.emit({
    kind: "editor-focused-on-past-note",
    noteId: selection.noteId,
    occurredOn: now,
  });

  return newSession;
}
