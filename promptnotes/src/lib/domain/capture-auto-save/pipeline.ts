// capture-auto-save/pipeline.ts
// Full CaptureAutoSave pipeline — orchestrates Steps 1 through 4.
//
// REQ-001: Happy path → Result<NoteFileSaved, SaveError>
// REQ-003: EmptyNoteDiscarded → returned as SaveError (empty-body-on-idle)
// REQ-008: SaveNoteRequested emitted at editing → saving transition
// REQ-015: EditingSessionState transitions
// REQ-016: I/O confinement — clockNow exactly once
// REQ-017: Pipeline function signature matches CaptureAutoSave type
//
// Sprint 4 fixes:
//   FIND-001: dispatch-save-request.ts removed (dead code)
//   FIND-002: Return type matches canonical Result<NoteFileSaved, SaveError>
//   FIND-003: captureAutoSave accepts CaptureDeps; extra ports via makePipeline
//   FIND-004: TagInventoryUpdated emitted via separate internal callback
//   FIND-005: Step 3 logic inlined in pipeline

import type { Result } from "promptnotes-domain-types/util/result";
import type { Timestamp, Frontmatter, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  SaveNoteRequested,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState, SavingState, SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { CaptureDeps } from "promptnotes-domain-types/capture/ports";
import type { DirtyEditingSession } from "promptnotes-domain-types/capture/stages";
import { prepareSaveRequest, type PrepareSaveRequestDeps } from "./prepare-save-request.js";
import { serializeNote } from "./serialize-note.js";
import { updateProjections, type UpdateProjectionsDeps, type TagInventoryUpdated } from "./update-projections.js";

/**
 * Infrastructure ports that are NOT part of CaptureDeps.
 * These are injected at application assembly time, not at domain level.
 */
export type PipelineInfra = {
  readonly noteIsEmpty: (note: Note) => boolean;
  readonly getCurrentNote: () => Note;
  readonly getPreviousFrontmatter: () => Frontmatter | null;
  readonly writeFileAtomic: (path: string, content: string) => Result<void, FsError>;
  readonly vaultPath: VaultPath;
  readonly refreshSort: () => void;
  readonly applyTagDelta: (prev: Frontmatter | null, next: Frontmatter) => boolean;
  readonly emitInternal: (event: TagInventoryUpdated) => void;
  readonly beginAutoSave: (state: EditingState, now: Timestamp) => SavingState;
  readonly onSaveSucceeded: (state: SavingState, now: Timestamp) => EditingState;
  readonly onSaveFailed: (state: SavingState, error: SaveError) => SaveFailedState;
};

/**
 * Factory that produces the canonical CaptureAutoSave function.
 * REQ-017: returned function signature matches (deps: CaptureDeps) => ...
 */
export function makeCaptureAutoSavePipeline(
  infra: PipelineInfra,
): (deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>> {
  return (deps: CaptureDeps) => {
    return async (
      state: EditingState,
      trigger: "idle" | "blur",
    ): Promise<Result<NoteFileSaved, SaveError>> => {
      const note = infra.getCurrentNote();
      const previousFrontmatter = infra.getPreviousFrontmatter();

      const dirtySession: DirtyEditingSession = {
        kind: "DirtyEditingSession",
        noteId: state.currentNoteId,
        note,
        previousFrontmatter,
        trigger,
      };

      // Step 1: prepareSaveRequest (uses clockNow exactly once — PROP-014)
      const prepareDeps: PrepareSaveRequestDeps = {
        clockNow: deps.clockNow,
        noteIsEmpty: infra.noteIsEmpty,
        publish: deps.publish,
      };
      const prepareResult = prepareSaveRequest(prepareDeps)(dirtySession);

      if (!prepareResult.ok) {
        return prepareResult;
      }

      // REQ-003: EmptyNoteDiscarded — event emitted, return validation error.
      // State does NOT transition to saving (PROP-023).
      if (prepareResult.value.kind === "empty-discarded") {
        return {
          ok: false,
          error: {
            kind: "validation",
            reason: { kind: "empty-body-on-idle" },
          },
        };
      }

      const validatedRequest = prepareResult.value.request;

      // REQ-015: transition editing → saving
      const savingState = infra.beginAutoSave(state, validatedRequest.requestedAt);

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
      deps.publish(saveRequested);

      // Step 2: serializeNote (pure — no ports)
      const serialized = serializeNote(validatedRequest);

      // Step 3: writeMarkdown (write I/O boundary)
      const filePath = `${infra.vaultPath}/${validatedRequest.noteId}.md`;
      const writeResult = infra.writeFileAtomic(filePath, serialized);

      if (!writeResult.ok) {
        const fsError = writeResult.error;
        // REQ-010: emit NoteSaveFailed
        const failEvent: NoteSaveFailed = {
          kind: "note-save-failed",
          noteId: validatedRequest.noteId,
          reason: mapFsErrorToReason(fsError),
          occurredOn: validatedRequest.requestedAt,
        };
        deps.publish(failEvent);

        const saveError: SaveError = { kind: "fs", reason: fsError };
        // REQ-015: transition saving → save-failed
        infra.onSaveFailed(savingState, saveError);

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
      deps.publish(savedEvent);

      // REQ-015: transition saving → editing (success)
      infra.onSaveSucceeded(savingState, validatedRequest.requestedAt);

      // REQ-011 / REQ-012: Step 4 — updateProjections
      const projDeps: UpdateProjectionsDeps = {
        refreshSort: infra.refreshSort,
        applyTagDelta: infra.applyTagDelta,
        emitInternal: infra.emitInternal,
      };
      updateProjections(projDeps)(savedEvent);

      return { ok: true, value: savedEvent };
    };
  };
}

/**
 * Convenience: flat-ports API for tests.
 * Wraps makeCaptureAutoSavePipeline for backward compatibility.
 */
export type CaptureAutoSavePorts = CaptureDeps & PipelineInfra;

export function captureAutoSave(
  ports: CaptureAutoSavePorts,
): (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>> {
  const deps: CaptureDeps = {
    clockNow: ports.clockNow,
    allocateNoteId: ports.allocateNoteId,
    clipboardWrite: ports.clipboardWrite,
    publish: ports.publish,
  };
  return makeCaptureAutoSavePipeline(ports)(deps);
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
