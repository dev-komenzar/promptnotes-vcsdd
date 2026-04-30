// capture-auto-save/pipeline.ts
// Full CaptureAutoSave pipeline — orchestrates Steps 1 through 4.
//
// REQ-001: Happy path → Result<NoteFileSaved, SaveError>
// REQ-008: SaveNoteRequested emitted at editing → saving transition
// REQ-015: EditingSessionState transitions (editing → saving → editing/save-failed)
// REQ-016: I/O confinement — clockNow exactly once
// REQ-017: Pipeline function signature matches CaptureAutoSave type
//
// FIND-001 (Sprint 1 Phase 3): State machine transitions now invoked
// FIND-002 (Sprint 1 Phase 3): updateProjections now called
// FIND-004 (Sprint 1 Phase 3): EmptyNoteDiscarded returns Err with validation error
// FIND-011 (Sprint 1 Phase 3): SaveNoteRequested emitted at state transition

import type { Result } from "promptnotes-domain-types/util/result";
import type { Timestamp, Frontmatter, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  SaveNoteRequested,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState, SavingState, SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { DirtyEditingSession, ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import { prepareSaveRequest, type PrepareSaveRequestDeps } from "./prepare-save-request.js";
import { serializeNote } from "./serialize-note.js";
import { dispatchSaveRequest, type DispatchSaveRequestDeps } from "./dispatch-save-request.js";
import { updateProjections, type UpdateProjectionsDeps } from "./update-projections.js";

/**
 * Extended ports for the CaptureAutoSave pipeline.
 * Includes CaptureDeps (clockNow, publish) plus pipeline-specific ports.
 */
export type CaptureAutoSavePorts = {
  // CaptureDeps core
  readonly clockNow: () => Timestamp;
  readonly publish: (event: PublicDomainEvent) => void;
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
): (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>> {
  return async (
    state: EditingState,
    trigger: "idle" | "blur",
  ): Promise<Result<NoteFileSaved, SaveError>> => {
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

    // FIND-004: EmptyNoteDiscarded — state does NOT transition to saving.
    // Event was already emitted by prepareSaveRequest. Return early without
    // fabricating a NoteFileSaved.
    if (prepareResult.value.kind === "empty-discarded") {
      // Per REQ-003 and FIND-004: EmptyNoteDiscarded is not an error in the
      // domain sense, but the pipeline return type is Result<NoteFileSaved, SaveError>.
      // We encode it as a validation error since no file was saved.
      return {
        ok: false,
        error: {
          kind: "validation",
          reason: { kind: "empty-body-on-idle" },
        },
      };
    }

    const validatedRequest = prepareResult.value.request;

    // FIND-001 / REQ-015: transition editing → saving
    const savingState = ports.beginAutoSave(state, validatedRequest.requestedAt);

    // FIND-011 / REQ-008: emit SaveNoteRequested at the state transition point
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
      ports.publish({
        kind: "note-save-failed",
        noteId: validatedRequest.noteId,
        reason: mapFsErrorToReason(fsError),
        occurredOn: validatedRequest.requestedAt,
      });

      const saveError: SaveError = { kind: "fs", reason: fsError };

      // FIND-001 / REQ-015: transition saving → save-failed
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

    // FIND-001 / REQ-015: transition saving → editing (success)
    ports.onSaveSucceeded(savingState, validatedRequest.requestedAt);

    // FIND-002 / REQ-011 / REQ-012: Step 4 — updateProjections
    const projDeps: UpdateProjectionsDeps = {
      refreshSort: ports.refreshSort,
      applyTagDelta: ports.applyTagDelta,
      publish: ports.publish as any,
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
