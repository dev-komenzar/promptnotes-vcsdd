// copy-body/pipeline.ts
// CopyBody pipeline (Workflow 6).
//
// Canonical type (capture/workflows.ts):
//   CopyBody = (deps: CaptureDeps) => (state: EditingState) => Result<ClipboardText, SaveError>
//
// REQ-001: Happy path returns Ok(ClipboardText).
// REQ-003: Only clipboardWrite as I/O port; clockNow at-most-once on success.
// REQ-004 / REQ-010: Clipboard failure → Err(SaveError.fs); validation kind never produced.
// REQ-005: NoteBodyCopiedToClipboard emitted via emitInternal on success only.
// REQ-006: Inputs are not mutated.
// REQ-007: Empty / whitespace bodies are copied through.
// REQ-009: clockNow is the source of NoteBodyCopiedToClipboard.occurredOn.
// REQ-011: I/O budget — success: 1/1/1/0; failure: 1/0/0/0.
// REQ-012: Caller invariant — getCurrentNote().id === state.currentNoteId.

import type { Result } from "promptnotes-domain-types/util/result";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { ClipboardText } from "promptnotes-domain-types/capture/stages";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { CaptureDeps } from "promptnotes-domain-types/capture/ports";
import type { NoteBodyCopiedToClipboard } from "promptnotes-domain-types/capture/internal-events";

export type CopyBodyInfra = {
  readonly getCurrentNote: () => Note;
  readonly bodyForClipboard: (note: Note) => string;
  readonly emitInternal: (event: NoteBodyCopiedToClipboard) => void;
};

/**
 * Minimal CaptureDeps slice that CopyBody actually uses (REQ-003).
 * Keeping this narrow lets the flat-ports `copyBody` pass a real object
 * without an unsound cast.
 */
export type CopyBodyDeps = Pick<CaptureDeps, "clockNow" | "clipboardWrite">;

/**
 * Factory that produces the canonical CopyBody function.
 *
 * Caller precondition (REQ-012): `infra.getCurrentNote().id === state.currentNoteId`.
 * The pipeline does not enforce this at runtime.
 *
 * Note: the public canonical `CopyBody` type expects full `CaptureDeps`. This
 * factory accepts the narrower `CopyBodyDeps`; structural assignability makes
 * a full `CaptureDeps` accepted at the call site without any cast.
 */
export function makeCopyBodyPipeline(
  infra: CopyBodyInfra,
): (deps: CopyBodyDeps) => (state: EditingState) => Result<ClipboardText, SaveError> {
  return (deps) => (state) => {
    const note = infra.getCurrentNote();
    const text = infra.bodyForClipboard(note);

    const writeResult = deps.clipboardWrite(text);
    if (!writeResult.ok) {
      return { ok: false, error: { kind: "fs", reason: writeResult.error } };
    }

    const occurredOn = deps.clockNow();
    const event: NoteBodyCopiedToClipboard = {
      kind: "note-body-copied-to-clipboard",
      noteId: state.currentNoteId,
      occurredOn,
    };
    infra.emitInternal(event);

    return {
      ok: true,
      value: { kind: "ClipboardText", text, noteId: state.currentNoteId },
    };
  };
}

/**
 * Flat-ports convenience for tests. Mirrors the pattern in
 * capture-auto-save/pipeline.ts.
 */
export type CopyBodyPorts = CopyBodyDeps & CopyBodyInfra;

export function copyBody(
  ports: CopyBodyPorts,
): (state: EditingState) => Result<ClipboardText, SaveError> {
  const deps: CopyBodyDeps = {
    clockNow: ports.clockNow,
    clipboardWrite: ports.clipboardWrite,
  };
  return makeCopyBodyPipeline(ports)(deps);
}
