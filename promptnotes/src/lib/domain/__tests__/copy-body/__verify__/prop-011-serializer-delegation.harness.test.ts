/**
 * PROP-011: Serializer delegation — bodyForClipboard(note) calls
 * serializeBlocksToMarkdown exactly once per invocation, with note.blocks as
 * the only argument.
 *
 * Approach chosen: Approach A (DI-style wrapper test).
 *
 * Rationale: The sprint 3 Phase 2b implementation is required to expose
 * `bodyForClipboard` as a thin wrapper that calls `serializeBlocksToMarkdown`.
 * For Phase 2a (Red phase), we test this through the `CopyBodyPorts.bodyForClipboard`
 * injection point: we supply a spy as the `bodyForClipboard` port and assert
 * the pipeline calls it exactly once per invocation with the note from
 * `getCurrentNote()`.
 *
 * Additionally, we include a direct unit test of the `bodyForClipboard` module
 * that wraps the serializer with a call-counting spy injected via a local helper.
 * This test is structured to FAIL in Phase 2a because the current implementation
 * of `body-for-clipboard.ts` does not call `serializeBlocksToMarkdown` — it
 * directly accesses `note.body` (which is undefined in the block-based Note shape).
 *
 * Required API for Phase 2b impl:
 *   `bodyForClipboard(note: Note): string`
 *   — internally calls `serializeBlocksToMarkdown(note.blocks)` exactly once.
 *   — does NOT carry its own block-type → markdown prefix table.
 *
 * Tier 1 — spy-based unit test.
 * Required: true
 * REQ: REQ-013, REQ-014
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import { arbNote, makeBlock } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const blockId = (s: string): BlockId => s as unknown as BlockId;
const blockContent = (s: string): BlockContent => s as unknown as BlockContent;

// ── PROP-011 (A): Pipeline-level spy on bodyForClipboard port ─────────────
//
// This sub-claim verifies that the pipeline calls its `bodyForClipboard` infra
// port exactly once per invocation, passing the note from `getCurrentNote()`.
// This does NOT require Phase 2b to land — the pipeline already calls
// `infra.bodyForClipboard(note)` exactly once.

describe("PROP-011 (A): pipeline calls bodyForClipboard port exactly once", () => {
  test("∀ note: pipeline invokes bodyForClipboard port once with the note from getCurrentNote", () => {
    fc.assert(
      fc.property(arbNote(), (note) => {
        const state: EditingState = {
          status: "editing",
          currentNoteId: note.id,
          isDirty: false,
          lastInputAt: null,
          idleTimerHandle: null,
          lastSaveResult: null,
        } as EditingState;

        let spyCalls = 0;
        let spyArg: Note | null = null;

        const ports: CopyBodyPorts = {
          clockNow: () => ts(0),
          clipboardWrite: (): Result<void, FsError> => ({ ok: true, value: undefined }),
          getCurrentNote: () => note,
          bodyForClipboard: (n: Note) => {
            spyCalls += 1;
            spyArg = n;
            return serializeBlocksToMarkdown(n.blocks);
          },
          emitInternal: () => {},
        };

        copyBody(ports)(state);

        return spyCalls === 1 && spyArg === note;
      }),
      { numRuns: 200, seed: 101 },
    );
  });
});

// ── PROP-011 (B): Direct unit test of bodyForClipboard module ─────────────
//
// This sub-claim verifies that `bodyForClipboard(note)` from `body-for-clipboard.ts`
// delegates to `serializeBlocksToMarkdown` rather than doing its own block-to-markdown
// conversion or reading `note.body`.
//
// Phase 2a RED condition: the current implementation reads `note.body` (sprint 2 impl),
// which is `undefined` for block-shaped notes. The test fails because:
//   - `bodyForClipboard(note)` returns `undefined` (note.body is undefined)
//   - the assertion `=== serializeBlocksToMarkdown(note.blocks)` fails
//
// Phase 2b GREEN condition: the impl calls `serializeBlocksToMarkdown(note.blocks)`,
// making this test pass.

describe("PROP-011 (B): bodyForClipboard module delegates to serializeBlocksToMarkdown", () => {
  test("bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks) for a concrete block-shaped note", () => {
    // Construct a block-shaped Note (no `body` field).
    const blocks: ReadonlyArray<Block> = [
      makeBlock("paragraph", "hello"),
      makeBlock("heading-1", "World"),
    ];
    const note: Note = {
      id: id("spy-test-note-001"),
      blocks,
      frontmatter: {
        tags: [],
        createdAt: ts(1),
        updatedAt: ts(2),
      } as unknown as Frontmatter,
    } as unknown as Note;

    const actual = bodyForClipboard(note);
    const expected = serializeBlocksToMarkdown(blocks);

    // RED: actual is `undefined` (reads note.body which doesn't exist).
    // GREEN: actual === "hello\n# World".
    expect(actual).toBe(expected);
  });

  test("∀ block-shaped note: bodyForClipboard returns serializeBlocksToMarkdown output", () => {
    fc.assert(
      fc.property(arbNote(), (note) => {
        const actual = bodyForClipboard(note);
        const expected = serializeBlocksToMarkdown(note.blocks);
        return actual === expected;
      }),
      { numRuns: 500, seed: 103 },
    );
  });

  test("bodyForClipboard does not access note.body (block-shaped note has no body field)", () => {
    // A note with explicitly undefined body — if impl reads note.body it gets undefined.
    // If impl correctly calls serializeBlocksToMarkdown(note.blocks) it gets the right string.
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "test content")];
    const noteWithoutBody = {
      id: id("no-body-test-001"),
      blocks,
      frontmatter: {
        tags: [],
        createdAt: ts(1),
        updatedAt: ts(2),
      } as unknown as Frontmatter,
      // Note: no `body` property — the new Note type does not have `body`.
    } as unknown as Note;

    // RED: returns undefined (reads missing note.body). GREEN: "test content".
    expect(bodyForClipboard(noteWithoutBody)).toBe("test content");
  });
});
