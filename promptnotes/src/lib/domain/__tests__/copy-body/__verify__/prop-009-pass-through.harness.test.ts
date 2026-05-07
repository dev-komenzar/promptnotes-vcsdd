/**
 * PROP-009: Pass-through fidelity.
 *   result.value.text === bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)
 *   result.value.noteId === state.currentNoteId
 *
 * Sprint 3: arbitrary produces block-shaped Note `{ id, blocks, frontmatter }`.
 * Inputs are constrained to note.id === state.currentNoteId (REQ-012).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 * REQ: REQ-001, REQ-012
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import { arbStateAndNote } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

describe("PROP-009: pass-through fidelity", () => {
  test("∀ (state, note) with matching id: text === serializeBlocksToMarkdown(note.blocks), noteId === state.currentNoteId", () => {
    fc.assert(
      fc.property(arbStateAndNote(), ({ state, note }) => {
        const ports: CopyBodyPorts = {
          clockNow: () => ts(0),
          clipboardWrite: (): Result<void, FsError> => ({ ok: true, value: undefined }),
          getCurrentNote: () => note,
          bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
          emitInternal: () => {},
        };
        const r = copyBody(ports)(state);
        if (!r.ok) return false;
        return (
          r.value.text === serializeBlocksToMarkdown(note.blocks) &&
          r.value.noteId === state.currentNoteId &&
          r.value.kind === "ClipboardText"
        );
      }),
      { numRuns: 500, seed: 13 },
    );
  });
});
