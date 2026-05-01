/**
 * PROP-008: Empty / whitespace-only bodies are still copied through.
 *   result.ok === true, internal event is emitted, no early-discard branch.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type {
  Body,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const body = (s: string): Body => s as unknown as Body;

function arbWhitespaceOrEmpty(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    fc.stringMatching(/^[ \t\n\r]{1,20}$/),
  );
}

function arbNoteIdLocal(): fc.Arbitrary<NoteId> {
  return fc.stringMatching(/^[a-z0-9-]{10,30}$/).map(id);
}

describe("PROP-008: empty / whitespace bodies copy through", () => {
  test("∀ (noteId, emptyOrWsBody): result.ok=true, text preserved, event emitted", () => {
    fc.assert(
      fc.property(arbNoteIdLocal(), arbWhitespaceOrEmpty(), (noteId, raw) => {
        const note: Note = {
          id: noteId,
          body: body(raw),
          frontmatter: {
            tags: [],
            createdAt: ts(1),
            updatedAt: ts(2),
          } as unknown as Frontmatter,
        };
        const state: EditingState = {
          status: "editing",
          currentNoteId: noteId,
          isDirty: false,
          lastInputAt: null,
          idleTimerHandle: null,
          lastSaveResult: null,
        } as EditingState;

        let internalCount = 0;
        const ports: CopyBodyPorts = {
          clockNow: () => ts(0),
          clipboardWrite: (): Result<void, FsError> => ({ ok: true, value: undefined }),
          getCurrentNote: () => note,
          bodyForClipboard: (n) => n.body as unknown as string,
          emitInternal: () => {
            internalCount += 1;
          },
        };

        const r = copyBody(ports)(state);
        if (!r.ok) return false;
        return r.value.text === raw && internalCount === 1;
      }),
      { numRuns: 200, seed: 11 },
    );
  });
});
