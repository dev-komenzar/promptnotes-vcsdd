/**
 * PROP-EPNS-002: classifyCurrentSession(IdleState, request, null) always returns { kind: 'no-current' }
 * Tier 1 — fast-check 1000 runs
 * Required: true
 *
 * Sprint 2 block-based: IdleState has no currentNoteId. No same-note comparison is possible.
 * result.kind === 'no-current' regardless of request.noteId.
 * currentNote is null for IdleState (PC-004 precondition).
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type { NoteId, BlockId, Frontmatter, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { IdleState } from "promptnotes-domain-types/capture/states";
import type { BlockFocusRequest } from "promptnotes-domain-types/capture/stages";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeBlockId(raw: string): BlockId { return raw as unknown as BlockId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
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

const arbNoteId = fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/).map(makeNoteId);
const arbBlockId = fc.stringMatching(/^block-[0-9]{1,4}$/).map(makeBlockId);
const arbIdleState: fc.Arbitrary<IdleState> = fc.constant({ status: "idle" as const });

const arbRequest: fc.Arbitrary<BlockFocusRequest> = fc.tuple(arbNoteId, arbBlockId).map(
  ([noteId, blockId]) => ({
    kind: "BlockFocusRequest" as const,
    noteId,
    blockId,
    snapshot: makeSnapshot(noteId),
  })
);

describe("PROP-EPNS-002: idle → no-current (Sprint 2 block-based)", () => {
  test("∀ IdleState × any BlockFocusRequest, result.kind === 'no-current' (1000 runs)", () => {
    fc.assert(
      fc.property(arbIdleState, arbRequest, (state, request) => {
        const result = classifyCurrentSession(state, request, null);
        expect(result.kind).toBe("no-current");
      }),
      { numRuns: 1000 },
    );
  });

  test("result has no noteId or note field (no-current is a bare kind)", () => {
    fc.assert(
      fc.property(arbIdleState, arbRequest, (state, request) => {
        const result = classifyCurrentSession(state, request, null);
        expect(result).toEqual({ kind: "no-current" });
      }),
      { numRuns: 100 },
    );
  });
});
