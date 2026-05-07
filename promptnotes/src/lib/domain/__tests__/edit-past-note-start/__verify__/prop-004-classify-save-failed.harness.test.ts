/**
 * PROP-EPNS-004: classifyCurrentSession(EditingState|SaveFailedState, request, note)
 *   with request.noteId === state.currentNoteId → { kind: 'same-note', noteId, note }
 * Tier 1 — fast-check 1000 runs
 * Required: true
 *
 * Sprint 2 block-based:
 * - same-note detection is now in classifyCurrentSession (no pre-pipeline guard)
 * - Works for BOTH EditingState and SaveFailedState
 * - Returns { kind: 'same-note', noteId, note } when request.noteId === state.currentNoteId
 * - Note.blocks is used (no body field)
 * - Data-loss safety invariant: same-note NEVER triggers save I/O
 *
 * Also covers PROP-EPNS-013: SaveFailedState + cross-noteId → always 'dirty'
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
import type {
  EditingState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
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

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "unknown" as const, detail: "test" } }),
  fc.constant({ kind: "validation" as const, reason: { kind: "empty-body-on-idle" as const } }),
);

const arbNote = (noteId: NoteId): fc.Arbitrary<Note> =>
  fc.array(arbBlockId, { minLength: 1, maxLength: 5 }).map((blockIds): Note => ({
    id: noteId,
    blocks: blockIds.map((id, i) => makeBlock(i === 0 ? "" : "content", "paragraph", id as unknown as string)),
    frontmatter: makeFrontmatter(),
  } as unknown as Note));

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

const arbSaveFailedState = (noteId: NoteId): fc.Arbitrary<SaveFailedState> =>
  fc.tuple(
    fc.option(fc.tuple(arbNoteId, arbBlockId).map(([n, b]) => ({ noteId: n, blockId: b })), { nil: null }),
    arbSaveError,
  ).map(([pending, error]): SaveFailedState => ({
    status: "save-failed" as const,
    currentNoteId: noteId,
    pendingNextFocus: pending,
    lastSaveError: error,
  }));

/** Same-note request: request.noteId === state.currentNoteId, snapshot=null */
const arbSameNoteRequest = (noteId: NoteId): fc.Arbitrary<BlockFocusRequest> =>
  arbBlockId.map((blockId): BlockFocusRequest => ({
    kind: "BlockFocusRequest" as const,
    noteId,
    blockId,
    snapshot: null,
  }));

/** Cross-note request: different noteId, with snapshot */
const arbCrossNoteRequest = (currentNoteId: NoteId): fc.Arbitrary<BlockFocusRequest> =>
  fc.tuple(
    arbNoteId.filter((id) => (id as unknown as string) !== (currentNoteId as unknown as string)),
    arbBlockId,
  ).map(([noteId, blockId]): BlockFocusRequest => ({
    kind: "BlockFocusRequest" as const,
    noteId,
    blockId,
    snapshot: makeSnapshot(noteId),
  }));

// ── PROP-EPNS-004: same-noteId → same-note ───────────────────────────────

describe("PROP-EPNS-004: same-noteId → same-note for EditingState AND SaveFailedState", () => {
  test("EditingState: ∀ request.noteId === state.currentNoteId → same-note (1000 runs)", () => {
    fc.assert(
      fc.property(
        arbNoteId.chain((noteId) =>
          fc.tuple(
            arbEditingState(noteId),
            arbSameNoteRequest(noteId),
            arbNote(noteId),
          )
        ),
        ([state, request, note]) => {
          const result = classifyCurrentSession(state, request, note);
          expect(result.kind).toBe("same-note");
          if (result.kind === "same-note") {
            expect(result.noteId).toBe(state.currentNoteId);
            expect(result.note).toBe(note);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  test("SaveFailedState: ∀ request.noteId === state.currentNoteId → same-note (1000 runs)", () => {
    fc.assert(
      fc.property(
        arbNoteId.chain((noteId) =>
          fc.tuple(
            arbSaveFailedState(noteId),
            arbSameNoteRequest(noteId),
            arbNote(noteId),
          )
        ),
        ([state, request, note]) => {
          const result = classifyCurrentSession(state, request, note);
          expect(result.kind).toBe("same-note");
          if (result.kind === "same-note") {
            expect(result.noteId).toBe(state.currentNoteId);
            expect(result.note).toBe(note);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ── PROP-EPNS-013: SaveFailedState + cross-noteId → always dirty ──────────

describe("PROP-EPNS-013: SaveFailedState + cross-noteId → always 'dirty' (regardless of isEmpty)", () => {
  test("∀ SaveFailedState & cross-noteId & any note → result.kind === 'dirty' (500 runs)", () => {
    fc.assert(
      fc.property(
        arbNoteId.chain((noteId) =>
          fc.tuple(
            arbSaveFailedState(noteId),
            arbCrossNoteRequest(noteId),
            arbNote(noteId),
          )
        ),
        ([state, request, note]) => {
          const result = classifyCurrentSession(state, request, note);
          expect(result.kind).toBe("dirty");
          if (result.kind === "dirty") {
            expect(result.noteId).toBe(state.currentNoteId);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
