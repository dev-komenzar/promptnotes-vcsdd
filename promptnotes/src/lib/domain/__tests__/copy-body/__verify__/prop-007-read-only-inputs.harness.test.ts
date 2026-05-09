/**
 * PROP-007: copyBody is read-only — frozen inputs do not throw, and field
 * values are unchanged before/after the call.
 *
 * Sprint 3: arbitrary produces block-shaped Note `{ id, blocks, frontmatter }`.
 * The bodyForClipboard port delegates to serializeBlocksToMarkdown(note.blocks).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 * REQ: REQ-006
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import { arbStateAndNote } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

function deepFreeze<T>(o: T): T {
  if (o === null || typeof o !== "object" || Object.isFrozen(o)) return o;
  Object.freeze(o);
  for (const key of Object.keys(o as Record<string, unknown>)) {
    deepFreeze((o as Record<string, unknown>)[key]);
  }
  return o;
}

describe("PROP-007: copyBody does not mutate its inputs", () => {
  test("∀ (state, note) deep-frozen: copyBody does not throw and inputs are unchanged", () => {
    fc.assert(
      fc.property(arbStateAndNote(), ({ state, note }) => {
        const stateBefore = JSON.stringify(state);
        const noteBefore = JSON.stringify(note);

        deepFreeze(state);
        deepFreeze(note);

        const ports: CopyBodyPorts = {
          clockNow: () => ts(0),
          clipboardWrite: (): Result<void, FsError> => ({ ok: true, value: undefined }),
          getCurrentNote: () => note,
          bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
          emitInternal: () => {},
        };

        copyBody(ports)(state);

        return (
          JSON.stringify(state) === stateBefore && JSON.stringify(note) === noteBefore
        );
      }),
      { numRuns: 200, seed: 9 },
    );
  });
});
