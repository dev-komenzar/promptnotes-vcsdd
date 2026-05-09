/**
 * PROP-004: Success path I/O budget.
 *   clipboardWrite = 1, clockNow = 1, emitInternal = 1.
 *
 * Sprint 3: arbitrary produces block-shaped Note `{ id, blocks, frontmatter }`.
 * The bodyForClipboard port now delegates to serializeBlocksToMarkdown(note.blocks).
 *
 * `publish = 0` is enforced statically: CopyBodyDeps does not include
 * `publish`, so the factory cannot reference it. No runtime check needed.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 * REQ: REQ-003, REQ-005, REQ-009, REQ-011
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

describe("PROP-004: success-path I/O budget", () => {
  test("∀ (state, note): exactly 1 clipboardWrite, 1 clockNow, 1 emitInternal", () => {
    fc.assert(
      fc.property(arbStateAndNote(), ({ state, note }) => {
        let clipboardCalls = 0;
        let clockCalls = 0;
        let internalCalls = 0;

        const ports: CopyBodyPorts = {
          clockNow: () => {
            clockCalls += 1;
            return ts(123);
          },
          clipboardWrite: (_text: string): Result<void, FsError> => {
            clipboardCalls += 1;
            return { ok: true, value: undefined };
          },
          getCurrentNote: () => note,
          bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
          emitInternal: () => {
            internalCalls += 1;
          },
        };

        const result = copyBody(ports)(state);
        expect(result.ok).toBe(true);

        return clipboardCalls === 1 && clockCalls === 1 && internalCalls === 1;
      }),
      { numRuns: 200, seed: 1 },
    );
  });
});
