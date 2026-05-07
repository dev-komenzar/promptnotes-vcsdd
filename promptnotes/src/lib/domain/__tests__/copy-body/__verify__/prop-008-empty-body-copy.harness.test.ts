/**
 * PROP-008: Empty / minimal block arrangements are still copied through.
 *   result.ok === true, internal event is emitted, no early-discard branch.
 *
 * Sprint 3 migration: replaces the old empty-body (`body("")`) generators with
 * minimal-block fixtures using the `{ id, type, content }` block shape.
 *
 * Minimal block fixture examples (per REQ-007):
 *   - [{ id: <BlockId>, type: "paragraph", content: "" }] → ""
 *   - [{ id: <BlockId>, type: "divider",   content: "" }] → "---"
 *   - [{ id: <BlockId>, type: "paragraph", content: "   " }] → "   " (verbatim)
 *
 * Tier 1 — fast-check property test.
 * Required: true
 * REQ: REQ-007
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import { arbBlockId, makeBlock } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const blockContent = (s: string): BlockContent => s as unknown as BlockContent;

function arbNoteIdLocal(): fc.Arbitrary<NoteId> {
  return fc.stringMatching(/^[a-z0-9-]{10,30}$/).map(id);
}

/** Generates blocks of only empty or whitespace-only paragraph content. */
function arbMinimalParagraphBlock(): fc.Arbitrary<Block> {
  return fc.record({
    id: arbBlockId(),
    content: fc.oneof(
      fc.constant(""),
      fc.stringMatching(/^[ \t]{1,10}$/),
    ),
  }).map(({ id: bid, content }) => ({
    id: bid,
    type: "paragraph" as BlockType,
    content: blockContent(content),
  }) as unknown as Block);
}

describe("PROP-008: empty / minimal block arrangements copy through", () => {
  // ── Property test ──────────────────────────────────────────────────────

  test("∀ (noteId, minimal paragraph block): result.ok=true, text preserved, event emitted", () => {
    fc.assert(
      fc.property(arbNoteIdLocal(), arbMinimalParagraphBlock(), (noteId, block) => {
        const blocks: ReadonlyArray<Block> = [block];
        const note: Note = {
          id: noteId,
          blocks,
          frontmatter: {
            tags: [],
            createdAt: ts(1),
            updatedAt: ts(2),
          } as unknown as Frontmatter,
        } as unknown as Note;
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
          bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
          emitInternal: () => {
            internalCount += 1;
          },
        };

        const r = copyBody(ports)(state);
        if (!r.ok) return false;
        const expectedText = serializeBlocksToMarkdown(blocks);
        return r.value.text === expectedText && internalCount === 1;
      }),
      { numRuns: 200, seed: 11 },
    );
  });

  // ── Concrete fixtures (per REQ-007 spec examples) ─────────────────────

  test("single empty paragraph block → text=''", () => {
    const noteId = id("test-empty-para-001");
    const note: Note = {
      id: noteId,
      blocks: [makeBlock("paragraph", "")],
      frontmatter: { tags: [], createdAt: ts(1), updatedAt: ts(2) } as unknown as Frontmatter,
    } as unknown as Note;
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
      bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
      emitInternal: () => { internalCount += 1; },
    };

    const r = copyBody(ports)(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe("");
    expect(internalCount).toBe(1);
  });

  test("single divider block → text='---'", () => {
    const noteId = id("test-divider-001");
    const note: Note = {
      id: noteId,
      blocks: [makeBlock("divider", "")],
      frontmatter: { tags: [], createdAt: ts(1), updatedAt: ts(2) } as unknown as Frontmatter,
    } as unknown as Note;
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
      bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
      emitInternal: () => { internalCount += 1; },
    };

    const r = copyBody(ports)(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe("---");
    expect(internalCount).toBe(1);
  });

  test("whitespace-only paragraph block → text preserved verbatim", () => {
    const noteId = id("test-ws-para-001");
    const note: Note = {
      id: noteId,
      blocks: [makeBlock("paragraph", "   ")],
      frontmatter: { tags: [], createdAt: ts(1), updatedAt: ts(2) } as unknown as Frontmatter,
    } as unknown as Note;
    const state: EditingState = {
      status: "editing",
      currentNoteId: noteId,
      isDirty: false,
      lastInputAt: null,
      idleTimerHandle: null,
      lastSaveResult: null,
    } as EditingState;

    const ports: CopyBodyPorts = {
      clockNow: () => ts(0),
      clipboardWrite: (): Result<void, FsError> => ({ ok: true, value: undefined }),
      getCurrentNote: () => note,
      bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
      emitInternal: () => {},
    };

    const r = copyBody(ports)(state);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe("   ");
  });

  test("ClipboardWrite is called with '' when block serializes to empty string", () => {
    const noteId = id("test-empty-write-001");
    const note: Note = {
      id: noteId,
      blocks: [makeBlock("paragraph", "")],
      frontmatter: { tags: [], createdAt: ts(1), updatedAt: ts(2) } as unknown as Frontmatter,
    } as unknown as Note;
    const state: EditingState = {
      status: "editing",
      currentNoteId: noteId,
      isDirty: false,
      lastInputAt: null,
      idleTimerHandle: null,
      lastSaveResult: null,
    } as EditingState;

    const clipboardArgs: string[] = [];
    const ports: CopyBodyPorts = {
      clockNow: () => ts(0),
      clipboardWrite: (text): Result<void, FsError> => {
        clipboardArgs.push(text);
        return { ok: true, value: undefined };
      },
      getCurrentNote: () => note,
      bodyForClipboard: (n: Note) => serializeBlocksToMarkdown(n.blocks),
      emitInternal: () => {},
    };

    copyBody(ports)(state);
    expect(clipboardArgs).toEqual([""]);
  });
});
