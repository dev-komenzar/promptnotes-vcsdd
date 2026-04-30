// edit-past-note-start/flush-current-session.ts
// Step 2: Flush (discard or save) the current session before switching.
//
// REQ-EPNS-001: no-current → no-op
// REQ-EPNS-002: empty → discard + EmptyNoteDiscarded
// REQ-EPNS-003: dirty, save succeeds → saved + NoteFileSaved
// REQ-EPNS-004: dirty, save fails → SwitchError + NoteSaveFailed
// REQ-EPNS-012: Clock budget — 1 call on empty path, 0 on others

import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteId, Timestamp, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { SaveError, SwitchError, NoteSaveFailureReason } from "promptnotes-domain-types/shared/errors";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type {
  CurrentSessionDecision,
  FlushedCurrentSession,
} from "promptnotes-domain-types/capture/stages";

export type FlushCurrentSessionPorts = {
  readonly clockNow: () => Timestamp;
  readonly blurSave: (
    noteId: NoteId,
    note: Note,
    previousFrontmatter: Frontmatter | null,
  ) => Result<NoteFileSaved, SaveError>;
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

/**
 * Flush the current session based on the classification decision.
 *
 * @param decision - Result from classifyCurrentSession
 * @param selectedNoteId - The note the user wants to switch to (for SwitchError.pendingNextNoteId)
 * @param ports - I/O ports
 * @returns Ok(FlushedCurrentSession) or Err(SwitchError)
 */
export function flushCurrentSession(
  decision: CurrentSessionDecision,
  selectedNoteId: NoteId | null,
  ports: FlushCurrentSessionPorts,
  previousFrontmatter: Frontmatter | null,
): Result<FlushedCurrentSession, SwitchError> {
  switch (decision.kind) {
    case "no-current":
      return { ok: true, value: { kind: "FlushedCurrentSession", result: "no-op" } };

    case "empty": {
      // REQ-EPNS-012: Clock.now() called once for EmptyNoteDiscarded.occurredOn
      const occurredOn = ports.clockNow();
      ports.emit({
        kind: "empty-note-discarded",
        noteId: decision.noteId,
        occurredOn,
      });
      return { ok: true, value: { kind: "FlushedCurrentSession", result: "discarded" } };
    }

    case "dirty": {
      // REQ-EPNS-003/004: Invoke blur save
      const saveResult = ports.blurSave(
        decision.noteId,
        decision.note,
        previousFrontmatter ?? null,
      );

      if (saveResult.ok) {
        // Emit NoteFileSaved
        ports.emit(saveResult.value);
        return { ok: true, value: { kind: "FlushedCurrentSession", result: "saved" } };
      }

      // REQ-EPNS-004: Save failed → emit NoteSaveFailed + return SwitchError
      // FIND-001: Use ports.clockNow() instead of Date.now()
      const reason = mapSaveErrorToFailureReason(saveResult.error);
      const failOccurredOn = ports.clockNow();
      ports.emit({
        kind: "note-save-failed",
        noteId: decision.noteId,
        reason,
        occurredOn: failOccurredOn,
      });

      if (selectedNoteId === null) {
        throw new Error(
          "flushCurrentSession: selectedNoteId must not be null on dirty-fail path"
        );
      }
      return {
        ok: false,
        error: {
          kind: "save-failed-during-switch",
          underlying: saveResult.error,
          pendingNextNoteId: selectedNoteId,
        },
      };
    }
  }
}

/** REQ-EPNS-004: SaveError → NoteSaveFailureReason mapping */
function mapSaveErrorToFailureReason(error: SaveError): NoteSaveFailureReason {
  if (error.kind === "fs") {
    switch (error.reason.kind) {
      case "permission": return "permission";
      case "disk-full": return "disk-full";
      case "lock": return "lock";
      default: return "unknown";
    }
  }
  return "unknown";
}
