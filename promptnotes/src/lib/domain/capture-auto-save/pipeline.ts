// capture-auto-save/pipeline.ts
// Full CaptureAutoSave pipeline — orchestrates Steps 1 through 4.
//
// REQ-001: Happy path → Result<NoteFileSaved, SaveError>
// REQ-003: EmptyNoteDiscarded → Ok channel (not Err)
// REQ-008: SaveNoteRequested emitted at editing → saving transition
// REQ-015: EditingSessionState transitions (editing → saving → editing/save-failed)
// REQ-016: I/O confinement — clockNow exactly once
// REQ-017: Pipeline function signature
//
// Sprint 2 fixes: FIND-001 state transitions, FIND-002 updateProjections called
// Sprint 3 fixes: FIND-001 EmptyNoteDiscarded Ok channel, FIND-002 CaptureDeps,
//   FIND-005 remove dead dispatch-save-request, FIND-007 typed publish

import type { Result } from "promptnotes-domain-types/util/result";
import type { Timestamp, Frontmatter, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  EmptyNoteDiscarded,
  SaveNoteRequested,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState, SavingState, SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { CaptureDeps } from "promptnotes-domain-types/capture/ports";
import type { DirtyEditingSession, ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import { prepareSaveRequest, type PrepareSaveRequestDeps } from "./prepare-save-request.js";
import { serializeNote } from "./serialize-note.js";
import { updateProjections, type UpdateProjectionsDeps } from "./update-projections.js";

/**
 * Pipeline result: either NoteFileSaved or EmptyNoteDiscarded (both Ok channel).
 * EmptyNoteDiscarded is a valid early-exit, not an error (REQ-003, FIND-001).
 */
export type CaptureAutoSaveResult = NoteFileSaved | EmptyNoteDiscarded;

/**
 * Extended ports for the CaptureAutoSave pipeline.
 * Extends CaptureDeps with pipeline-specific ports.
 * REQ-017 / FIND-002: The base CaptureDeps fields are included.
 */
export type CaptureAutoSavePorts = CaptureDeps & {
  // Step 1 ports
  readonly noteIsEmpty: (note: Note) => boolean;
  readonly getCurrentNote: () => Note;
  readonly getPreviousFrontmatter: () => Frontmatter | null;
  // Step 3 ports (Vault boundary)
  readonly writeFileAtomic: (path: string, content: string) => Result<void, FsError>;
  readonly vaultPath: VaultPath;
  // Step 4 ports (Curate projections)
  readonly refreshSort: () => void;
  readonly applyTagDelta: (prev: Frontmatter | null, next: Frontmatter) => boolean;
  // State machine transitions (REQ-015)
  readonly beginAutoSave: (state: EditingState, now: Timestamp) => SavingState;
  readonly onSaveSucceeded: (state: SavingState, now: Timestamp) => EditingState;
  readonly onSaveFailed: (state: SavingState, error: SaveError) => SaveFailedState;
};

export function captureAutoSave(
  ports: CaptureAutoSavePorts,
): (state: EditingState, trigger: "idle" | "blur") => Promise<Result<CaptureAutoSaveResult, SaveError>> {
  return async (
    state: EditingState,
    trigger: "idle" | "blur",
  ): Promise<Result<CaptureAutoSaveResult, SaveError>> => {
    const note = ports.getCurrentNote();
    const previousFrontmatter = ports.getPreviousFrontmatter();

    const dirtySession: DirtyEditingSession = {
      kind: "DirtyEditingSession",
      noteId: state.currentNoteId,
      note,
      previousFrontmatter,
      trigger,
    };

    // Step 1: prepareSaveRequest (uses clockNow exactly once — PROP-014)
    const prepareDeps: PrepareSaveRequestDeps = {
      clockNow: ports.clockNow,
      noteIsEmpty: ports.noteIsEmpty,
      publish: ports.publish,
    };
    const prepareResult = prepareSaveRequest(prepareDeps)(dirtySession);

    if (!prepareResult.ok) {
      return prepareResult;
    }

    // REQ-003 / FIND-001 Sprint 3: EmptyNoteDiscarded in Ok channel.
    // Event was already emitted by prepareSaveRequest.
    // State does NOT transition to saving (PROP-023).
    if (prepareResult.value.kind === "empty-discarded") {
      return { ok: true, value: prepareResult.value.event };
    }

    const validatedRequest = prepareResult.value.request;

    // REQ-015: transition editing → saving
    const savingState = ports.beginAutoSave(state, validatedRequest.requestedAt);

    // REQ-008: emit SaveNoteRequested at the state transition point
    const saveRequested: SaveNoteRequested = {
      kind: "save-note-requested",
      noteId: validatedRequest.noteId,
      body: validatedRequest.body,
      frontmatter: validatedRequest.frontmatter,
      previousFrontmatter: validatedRequest.previousFrontmatter,
      source: trigger === "idle" ? "capture-idle" : "capture-blur",
      occurredOn: validatedRequest.requestedAt,
    };
    ports.publish(saveRequested);

    // Step 2: serializeNote (pure — no ports)
    const serialized = serializeNote(validatedRequest);

    // Step 3: writeMarkdown (write I/O boundary)
    const filePath = `${ports.vaultPath}/${validatedRequest.noteId}.md`;
    const writeResult = ports.writeFileAtomic(filePath, serialized);

    if (!writeResult.ok) {
      // REQ-010: emit NoteSaveFailed
      const fsError = writeResult.error;
      const failEvent: NoteSaveFailed = {
        kind: "note-save-failed",
        noteId: validatedRequest.noteId,
        reason: mapFsErrorToReason(fsError),
        occurredOn: validatedRequest.requestedAt,
      };
      ports.publish(failEvent);

      const saveError: SaveError = { kind: "fs", reason: fsError };
      // REQ-015: transition saving → save-failed
      ports.onSaveFailed(savingState, saveError);

      return { ok: false, error: saveError };
    }

    // REQ-009: emit NoteFileSaved
    const savedEvent: NoteFileSaved = {
      kind: "note-file-saved",
      noteId: validatedRequest.noteId,
      body: validatedRequest.body,
      frontmatter: validatedRequest.frontmatter,
      previousFrontmatter: validatedRequest.previousFrontmatter,
      occurredOn: validatedRequest.requestedAt,
    };
    ports.publish(savedEvent);

    // REQ-015: transition saving → editing (success)
    ports.onSaveSucceeded(savingState, validatedRequest.requestedAt);

    // REQ-011 / REQ-012: Step 4 — updateProjections
    const projDeps: UpdateProjectionsDeps = {
      refreshSort: ports.refreshSort,
      applyTagDelta: ports.applyTagDelta,
      publish: (event) => ports.publish(event as unknown as PublicDomainEvent),
    };
    updateProjections(projDeps)(savedEvent);

    return { ok: true, value: savedEvent };
  };
}

function mapFsErrorToReason(err: FsError): "permission" | "disk-full" | "lock" | "unknown" {
  switch (err.kind) {
    case "permission": return "permission";
    case "disk-full": return "disk-full";
    case "lock": return "lock";
    case "not-found": return "unknown";
    case "unknown": return "unknown";
  }
}
