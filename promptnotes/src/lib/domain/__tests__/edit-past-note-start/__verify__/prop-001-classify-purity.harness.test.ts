/**
 * PROP-EPNS-001: classifyCurrentSession is pure (referential transparency)
 * Tier 1 — fast-check 1000 runs
 * Required: true
 *
 * Sprint 2 (block-based): signature is now (EditingSessionState, BlockFocusRequest, Note | null)
 * → CurrentSessionDecision. The added `currentNote` param preserves referential transparency
 * because all inputs are explicit parameters (no external buffer access).
 *
 * Property: ∀ (state, request, currentNote),
 *   classifyCurrentSession(state, request, currentNote) deepEquals
 *   classifyCurrentSession(state, request, currentNote)
 *
 * Also verifies: function arity === 3 (no hidden dependencies)
 * Also verifies: Clock.now() is NEVER called (PROP-EPNS-019 complementary)
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
  Frontmatter,
  BlockId,
  BlockContent,
  BlockType,
  Tag,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type {
  EditingSessionState,
  EditingState,
  IdleState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type {
  BlockFocusRequest,
} from "promptnotes-domain-types/capture/stages";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

// ── Arbitrary generators ──────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeBlockId(raw: string): BlockId { return raw as unknown as BlockId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
function makeBlockContent(raw: string): BlockContent { return raw as unknown as BlockContent; }
function makeTag(raw: string): Tag { return raw as unknown as Tag; }
function makeFrontmatter(tags: Tag[], created: number, updated: number): Frontmatter {
  return { tags, createdAt: makeTimestamp(created), updatedAt: makeTimestamp(updated) } as unknown as Frontmatter;
}

const arbNoteId = fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/).map(makeNoteId);
const arbBlockId = fc.stringMatching(/^block-[0-9]{1,4}$/).map(makeBlockId);
const arbTimestamp = fc.integer({ min: 0, max: 2_000_000_000_000 }).map(makeTimestamp);
const arbBlockContent = fc.string({ minLength: 0, maxLength: 50 }).map(makeBlockContent);
const arbBlockType: fc.Arbitrary<BlockType> = fc.constantFrom(
  "paragraph", "heading-1", "heading-2", "heading-3", "bullet", "numbered", "divider", "code", "quote"
) as fc.Arbitrary<BlockType>;
const arbTag = fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/).map(makeTag);
const arbFrontmatter = fc.tuple(
  fc.array(arbTag, { minLength: 0, maxLength: 3 }),
  fc.integer({ min: 0, max: 2_000_000_000_000 }),
  fc.integer({ min: 0, max: 2_000_000_000_000 }),
).map(([tags, c, u]) => makeFrontmatter(tags, c, u));

const arbBlock: fc.Arbitrary<Block> = fc.tuple(arbBlockId, arbBlockType, arbBlockContent).map(
  ([id, type, content]) => ({ id, type, content } as unknown as Block)
);

const arbNote: fc.Arbitrary<Note> = fc.tuple(
  arbNoteId,
  fc.array(arbBlock, { minLength: 1, maxLength: 5 }),
  arbFrontmatter,
).map(([id, blocks, fm]) => ({ id, blocks, frontmatter: fm } as unknown as Note));

const arbIdleState: fc.Arbitrary<IdleState> = fc.constant({ status: "idle" as const });

const arbEditingState: fc.Arbitrary<EditingState> = fc.tuple(arbNoteId, arbBlockId, fc.boolean()).map(
  ([noteId, blockId, isDirty]) => ({
    status: "editing" as const,
    currentNoteId: noteId,
    focusedBlockId: blockId,
    isDirty,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  })
);

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "unknown" as const, detail: "test" } }),
  fc.constant({ kind: "validation" as const, reason: { kind: "empty-body-on-idle" as const } }),
);

const arbSaveFailedState: fc.Arbitrary<SaveFailedState> = fc.tuple(
  arbNoteId,
  fc.option(fc.tuple(arbNoteId, arbBlockId).map(([n, b]) => ({ noteId: n, blockId: b })), { nil: null }),
  arbSaveError,
).map(([noteId, pending, error]) => ({
  status: "save-failed" as const,
  currentNoteId: noteId,
  pendingNextFocus: pending,
  lastSaveError: error,
}));

const arbSnapshot: fc.Arbitrary<NoteFileSnapshot> = arbNoteId.map((noteId) => ({
  noteId,
  body: "content" as unknown as Frontmatter,
  frontmatter: makeFrontmatter([], 1000, 1000),
  filePath: "/vault/test.md",
  fileMtime: makeTimestamp(1000),
} as unknown as NoteFileSnapshot));

/** BlockFocusRequest pointing to a different noteId than the state's currentNoteId (cross-note) */
const arbCrossNoteRequest = (stateNoteId: NoteId): fc.Arbitrary<BlockFocusRequest> =>
  fc.tuple(
    arbNoteId.filter((id) => (id as unknown as string) !== (stateNoteId as unknown as string)),
    arbBlockId,
    arbSnapshot,
  ).map(([noteId, blockId, snapshot]) => ({
    kind: "BlockFocusRequest" as const,
    noteId,
    blockId,
    snapshot,
  }));

/** BlockFocusRequest pointing to the same noteId as state's currentNoteId (same-note) */
const arbSameNoteRequest = (stateNoteId: NoteId): fc.Arbitrary<BlockFocusRequest> =>
  arbBlockId.map((blockId) => ({
    kind: "BlockFocusRequest" as const,
    noteId: stateNoteId,
    blockId,
    snapshot: null,
  }));

/** Valid (state, request, currentNote) tuples respecting preconditions */
const arbValidTuple: fc.Arbitrary<[EditingSessionState, BlockFocusRequest, Note | null]> = fc.oneof(
  // Idle: currentNote must be null; any cross-note request
  fc.tuple(arbIdleState, arbNoteId, arbBlockId, arbSnapshot).map(([s, noteId, blockId, snap]) => [
    s,
    { kind: "BlockFocusRequest" as const, noteId, blockId, snapshot: snap },
    null,
  ]),
  // EditingState + cross-note with non-null currentNote
  fc.tuple(arbEditingState, arbNote).chain(([s, note]) =>
    arbCrossNoteRequest(s.currentNoteId).map((req): [EditingSessionState, BlockFocusRequest, Note | null] => [s, req, note])
  ),
  // EditingState + same-note with non-null currentNote
  fc.tuple(arbEditingState, arbNote).chain(([s, note]) =>
    arbSameNoteRequest(s.currentNoteId).map((req): [EditingSessionState, BlockFocusRequest, Note | null] => [s, req, note])
  ),
  // SaveFailedState + cross-note with non-null currentNote
  fc.tuple(arbSaveFailedState, arbNote).chain(([s, note]) =>
    arbCrossNoteRequest(s.currentNoteId).map((req): [EditingSessionState, BlockFocusRequest, Note | null] => [s, req, note])
  ),
  // SaveFailedState + same-note with non-null currentNote
  fc.tuple(arbSaveFailedState, arbNote).chain(([s, note]) =>
    arbSameNoteRequest(s.currentNoteId).map((req): [EditingSessionState, BlockFocusRequest, Note | null] => [s, req, note])
  ),
);

// ── Property tests ──────────────────────────────────────────────────────

describe("PROP-EPNS-001: classifyCurrentSession purity (Sprint 2 block-based)", () => {
  test("referential transparency: same (state, request, currentNote) → same output (1000 runs)", () => {
    fc.assert(
      fc.property(arbValidTuple, ([state, request, currentNote]) => {
        const result1 = classifyCurrentSession(state, request, currentNote);
        const result2 = classifyCurrentSession(state, request, currentNote);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 1000 },
    );
  });

  test("function arity is exactly 3 (no hidden dependencies, Sprint 2 widened signature)", () => {
    // Sprint 2 delta: 3 params (state, request, currentNote)
    expect(classifyCurrentSession.length).toBe(3);
  });

  test("PROP-EPNS-019: Clock.now() / Date.now() is never called during classification", () => {
    const original = Date.now;
    let dateNowCalls = 0;
    Date.now = () => { dateNowCalls++; return original(); };
    try {
      fc.assert(
        fc.property(arbValidTuple, ([state, request, currentNote]) => {
          dateNowCalls = 0;
          classifyCurrentSession(state, request, currentNote);
          expect(dateNowCalls).toBe(0);
        }),
        { numRuns: 100 },
      );
    } finally {
      Date.now = original;
    }
  });
});
