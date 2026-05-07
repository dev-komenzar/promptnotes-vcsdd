// edit-past-note-start/flush-current-session.ts
// Step 2: Flush (discard or save) the current session before switching.
//
// REQ-EPNS-001: no-current → no-op
// REQ-EPNS-002: empty → discard + EmptyNoteDiscarded
// REQ-EPNS-003: dirty, save succeeds → saved + NoteFileSaved
// REQ-EPNS-004: dirty, save fails → SwitchError + NoteSaveFailed
// REQ-EPNS-005: same-note → same-note-skipped (no I/O)
// REQ-EPNS-012: Clock budget — 1 call on empty path, 1 call on dirty-fail path,
//               0 calls on no-current, dirty-success, and same-note paths.
//
// FIND-EPNS-S2-P3-005: blurSave is async (matches BlurSave port contract in workflows.ts).
// flushCurrentSession itself is async because the dirty path awaits blurSave.

import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteId, Timestamp, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { SaveError, SwitchError, NoteSaveFailureReason } from "promptnotes-domain-types/shared/errors";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type {
  BlockFocusRequest,
  CurrentSessionDecision,
  FlushedCurrentSession,
} from "promptnotes-domain-types/capture/stages";

export type FlushCurrentSessionPorts = {
  readonly clockNow: () => Timestamp;
  readonly blurSave: (
    noteId: NoteId,
    note: Note,
    previousFrontmatter: Frontmatter | null,
  ) => Promise<Result<NoteFileSaved, SaveError>>;
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

/**
 * Flush the current session based on the classification decision.
 *
 * @param decision - Result from classifyCurrentSession
 * @param request - BlockFocusRequest (carries target noteId+blockId for SwitchError.pendingNextFocus)
 * @param ports - I/O ports (blurSave is async)
 * @param previousFrontmatter - forwarded to blurSave on dirty path
 * @returns Promise<Ok(FlushedCurrentSession) | Err(SwitchError)>
 */
export async function flushCurrentSession(
  decision: CurrentSessionDecision,
  request: BlockFocusRequest,
  ports: FlushCurrentSessionPorts,
  previousFrontmatter: Frontmatter | null,
): Promise<Result<FlushedCurrentSession, SwitchError>> {
  switch (decision.kind) {
    case "no-current":
      return { ok: true, value: { kind: "FlushedCurrentSession", result: "no-op" } };

    case "same-note":
      // REQ-EPNS-005: same-note-skipped — no Clock, no emit, no blurSave
      return { ok: true, value: { kind: "FlushedCurrentSession", result: "same-note-skipped" } };

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
      // REQ-EPNS-003/004: Invoke blur save with note and previousFrontmatter (async)
      const saveResult = await ports.blurSave(
        decision.noteId,
        decision.note,
        previousFrontmatter,
      );

      if (saveResult.ok) {
        // Emit NoteFileSaved (the event returned by blurSave)
        ports.emit(saveResult.value);
        return { ok: true, value: { kind: "FlushedCurrentSession", result: "saved" } };
      }

      // REQ-EPNS-004: Save failed → emit NoteSaveFailed + return SwitchError
      // REQ-EPNS-012: Clock.now() called exactly once for NoteSaveFailed.occurredOn
      const reason = mapSaveErrorToFailureReason(saveResult.error);
      const occurredOn = ports.clockNow();
      ports.emit({
        kind: "note-save-failed",
        noteId: decision.noteId,
        reason,
        occurredOn,
      });

      return {
        ok: false,
        error: {
          kind: "save-failed-during-switch",
          underlying: saveResult.error,
          pendingNextFocus: {
            noteId: request.noteId,
            blockId: request.blockId,
          },
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
      case "not-found": return "unknown";
      case "unknown": return "unknown";
    }
  }
  // validation/* → unknown
  return "unknown";
}
