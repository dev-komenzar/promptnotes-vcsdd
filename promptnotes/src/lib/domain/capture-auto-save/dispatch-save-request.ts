// capture-auto-save/dispatch-save-request.ts
// Step 3: dispatchSaveRequest — emits SaveNoteRequested, writes file, emits result event.
//
// REQ-007: Atomic file write
// REQ-008: SaveNoteRequested emitted before write
// REQ-009: NoteFileSaved emitted on success
// REQ-010: NoteSaveFailed emitted on failure

import type { Result } from "promptnotes-domain-types/util/result";
import type { Timestamp, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  SaveNoteRequested,
  SaveNoteSource,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

export type DispatchSaveRequestDeps = {
  readonly writeFileAtomic: (path: string, content: string) => Result<void, FsError>;
  readonly clockNow: () => Timestamp;
  readonly publish: (event: PublicDomainEvent) => void;
  readonly serializeNote: (request: ValidatedSaveRequest) => string;
  readonly vaultPath: VaultPath;
};

function mapTriggerToSource(trigger: "idle" | "blur"): SaveNoteSource {
  switch (trigger) {
    case "idle": return "capture-idle";
    case "blur": return "capture-blur";
  }
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

export function dispatchSaveRequest(
  deps: DispatchSaveRequestDeps,
): (request: ValidatedSaveRequest) => Promise<Result<NoteFileSaved, SaveError>> {
  return async (request: ValidatedSaveRequest): Promise<Result<NoteFileSaved, SaveError>> => {
    const now = deps.clockNow();

    // REQ-008: emit SaveNoteRequested before write
    const saveRequested: SaveNoteRequested = {
      kind: "save-note-requested",
      noteId: request.noteId,
      body: request.body,
      frontmatter: request.frontmatter,
      previousFrontmatter: request.previousFrontmatter,
      source: mapTriggerToSource(request.trigger),
      occurredOn: now,
    };
    deps.publish(saveRequested);

    // Serialize and write
    const content = deps.serializeNote(request);
    const filePath = `${deps.vaultPath}/${request.noteId}.md`;
    const writeResult = deps.writeFileAtomic(filePath, content);

    if (!writeResult.ok) {
      // REQ-010: emit NoteSaveFailed
      const failEvent: NoteSaveFailed = {
        kind: "note-save-failed",
        noteId: request.noteId,
        reason: mapFsErrorToReason(writeResult.error),
        occurredOn: now,
      };
      deps.publish(failEvent);
      return { ok: false, error: { kind: "fs", reason: writeResult.error } };
    }

    // REQ-009: emit NoteFileSaved
    const savedEvent: NoteFileSaved = {
      kind: "note-file-saved",
      noteId: request.noteId,
      body: request.body,
      frontmatter: request.frontmatter,
      previousFrontmatter: request.previousFrontmatter,
      occurredOn: now,
    };
    deps.publish(savedEvent);

    return { ok: true, value: savedEvent };
  };
}
