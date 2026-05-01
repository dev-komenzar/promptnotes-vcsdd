/**
 * PROP-009: Pass-through fidelity.
 *   result.value.text === bodyForClipboard(note)
 *   result.value.noteId === state.currentNoteId
 *
 * Inputs are constrained to note.id === state.currentNoteId (REQ-012).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import { arbStateAndNote } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

describe("PROP-009: pass-through fidelity", () => {
  test("∀ (state, note) with matching id: text = note.body, noteId = state.currentNoteId", () => {
    fc.assert(
      fc.property(arbStateAndNote(), ({ state, note }) => {
        const ports: CopyBodyPorts = {
          clockNow: () => ts(0),
          clipboardWrite: (): Result<void, FsError> => ({ ok: true, value: undefined }),
          getCurrentNote: () => note,
          bodyForClipboard: (n) => n.body as unknown as string,
          emitInternal: () => {},
        };
        const r = copyBody(ports)(state);
        if (!r.ok) return false;
        return (
          r.value.text === (note.body as unknown as string) &&
          r.value.noteId === state.currentNoteId &&
          r.value.kind === "ClipboardText"
        );
      }),
      { numRuns: 500, seed: 13 },
    );
  });
});
