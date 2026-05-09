/**
 * PROP-EPNS-003: classifyCurrentSession(EditingState, request, currentNote) — cross-noteId cases
 *   NoteOps.isEmpty(currentNote) → { kind: 'empty', noteId }
 *   !NoteOps.isEmpty(currentNote) → { kind: 'dirty', noteId, note }
 * Tier 1 — fast-check 1000 runs
 * Required: true
 *
 * Sprint 2 block-based:
 * - NoteOps.isEmpty is block-based: blocks.length === 1 AND blocks[0] is empty paragraph
 * - Note has blocks[], NOT body field
 * - request is BlockFocusRequest (not just NoteId)
 * - same-noteId requests are covered by PROP-EPNS-004, excluded here
 *
 * IMPORTANT: The test generators ensure request.noteId !== state.currentNoteId
 * so that the same-note path is excluded from this property.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  BlockId,
  Timestamp,
  Frontmatter,
  BlockContent,
  BlockType,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { BlockFocusRequest } from "promptnotes-domain-types/capture/stages";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeBlockId(raw: string): BlockId { return raw as unknown as BlockId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
function makeBlockContent(raw: string): BlockContent { return raw as unknown as BlockContent; }
function makeFrontmatter(): Frontmatter {
  return { tags: [], createdAt: makeTimestamp(1000), updatedAt: makeTimestamp(1000) } as unknown as Frontmatter;
}
function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    body: "content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/test.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}
function makeBlock(content: string, type: BlockType = "paragraph", id = "block-001"): Block {
  return { id: makeBlockId(id), type: type as unknown as BlockType, content: makeBlockContent(content) } as unknown as Block;
}

const arbNoteId = fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/).map(makeNoteId);
const arbBlockId = fc.stringMatching(/^block-[0-9]{1,4}$/).map(makeBlockId);

// Two different noteIds: currentNoteId and targetNoteId
const arbDistinctNoteIds = fc.tuple(arbNoteId, arbNoteId).filter(
  ([a, b]) => (a as unknown as string) !== (b as unknown as string)
);

// Empty note: single empty paragraph — NoteOps.isEmpty === true
const arbEmptyNote = (noteId: NoteId): fc.Arbitrary<Note> =>
  fc.oneof(
    // empty paragraph
    fc.constant([makeBlock("", "paragraph", "block-e1")]),
    // whitespace-only paragraph
    fc.constantFrom(" ", "\t", "   ").map((ws) => [makeBlock(ws, "paragraph", "block-e2")]),
  ).map((blocks): Note => ({
    id: noteId,
    blocks,
    frontmatter: makeFrontmatter(),
  } as unknown as Note));

// Non-empty note: not a single empty paragraph — NoteOps.isEmpty === false
const arbNonEmptyNote = (noteId: NoteId): fc.Arbitrary<Note> =>
  fc.oneof(
    // paragraph with content
    fc.string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0)
      .map((s): Note => ({
        id: noteId,
        blocks: [makeBlock(s, "paragraph", "block-d1")],
        frontmatter: makeFrontmatter(),
      } as unknown as Note)),
    // two blocks (multi-block → not empty)
    fc.constant({
      id: noteId,
      blocks: [makeBlock("", "paragraph", "block-1"), makeBlock("", "paragraph", "block-2")],
      frontmatter: makeFrontmatter(),
    } as unknown as Note),
    // heading block (structural type → not empty regardless of content)
    fc.constantFrom<BlockType>("heading-1", "heading-2", "heading-3", "bullet", "numbered")
      .map((type): Note => ({
        id: noteId,
        blocks: [makeBlock("", type, "block-h1")],
        frontmatter: makeFrontmatter(),
      } as unknown as Note)),
  );

const arbEditingState = (noteId: NoteId): fc.Arbitrary<EditingState> =>
  fc.tuple(arbBlockId, fc.boolean()).map(([blockId, isDirty]): EditingState => ({
    status: "editing" as const,
    currentNoteId: noteId,
    focusedBlockId: blockId,
    isDirty,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  }));

const arbCrossNoteRequest = (targetId: NoteId): fc.Arbitrary<BlockFocusRequest> =>
  arbBlockId.map((blockId): BlockFocusRequest => ({
    kind: "BlockFocusRequest" as const,
    noteId: targetId,
    blockId,
    snapshot: makeSnapshot(targetId),
  }));

// ── Properties ───────────────────────────────────────────────────────────

describe("PROP-EPNS-003: editing state cross-noteId classification (block-based NoteOps.isEmpty)", () => {
  test("NoteOps.isEmpty(note) → 'empty' (1000 runs)", () => {
    fc.assert(
      fc.property(
        arbDistinctNoteIds.chain(([currentId, targetId]) =>
          fc.tuple(
            arbEditingState(currentId),
            arbCrossNoteRequest(targetId),
            arbEmptyNote(currentId),
          )
        ),
        ([state, request, note]) => {
          const result = classifyCurrentSession(state, request, note);
          expect(result.kind).toBe("empty");
          if (result.kind === "empty") {
            expect(result.noteId).toBe(state.currentNoteId);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  test("!NoteOps.isEmpty(note) → 'dirty' (1000 runs)", () => {
    fc.assert(
      fc.property(
        arbDistinctNoteIds.chain(([currentId, targetId]) =>
          fc.tuple(
            arbEditingState(currentId),
            arbCrossNoteRequest(targetId),
            arbNonEmptyNote(currentId),
          )
        ),
        ([state, request, note]) => {
          const result = classifyCurrentSession(state, request, note);
          expect(result.kind).toBe("dirty");
          if (result.kind === "dirty") {
            expect(result.noteId).toBe(state.currentNoteId);
            expect(result.note).toBe(note);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
