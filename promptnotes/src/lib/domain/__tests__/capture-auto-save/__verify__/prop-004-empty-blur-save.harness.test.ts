/**
 * PROP-004: Empty body + blur trigger → ValidatedSaveRequest (does NOT discard).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ note where noteIsEmpty(note)=true, trigger="blur"
 *   → result.ok === true && result.value.kind === "validated"
 *
 * Dual safety property: blur saves must NOT silently discard user data.
 * Even if the body is empty, blur saves must proceed to ValidatedSaveRequest.
 *
 * Sprint 2 update (block-based migration, REQ-004):
 * - Generator now produces Block[] sequences (all 5 true-isEmpty variants from REQ-003 table).
 * - PROP-004 note (FIND-020): this PROP asserts pipeline routing only (result.kind === 'validated').
 *   Body coherence is verified by PROP-024; body bytes vary by variant.
 * - RED: fails if ValidatedSaveRequest.blocks is not set by prepareSaveRequest.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import {
  prepareSaveRequest,
  type PrepareSaveRequestDeps,
} from "$lib/domain/capture-auto-save/prepare-save-request";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
  BlockId,
  BlockType,
  BlockContent,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { DirtyEditingSession } from "promptnotes-domain-types/capture/stages";

// Sprint 2: serializeBlocksToMarkdown for body coherence assertion
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(min = 1_000_000, max = 1_500_000): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min, max })
    .map((ms) => ({ epochMillis: ms } as unknown as Timestamp));
}

function arbTag(): fc.Arbitrary<Tag> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

function arbFrontmatter(): fc.Arbitrary<Frontmatter> {
  // createdAt must be strictly before clockNow (2_000_000_000) to avoid InvariantViolated
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(1_000_000, 1_500_000),
      updatedAt: arbTimestamp(1_000_000, 1_500_000),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

function arbBlockId(): fc.Arbitrary<BlockId> {
  return fc
    .stringMatching(/^block-[0-9]{1,4}$/)
    .map((s) => s as unknown as BlockId);
}

function makeBlockContent(raw: string): BlockContent {
  return raw as unknown as BlockContent;
}

// Sprint 2: Block[] generators for the 5 true-isEmpty variants (REQ-004 table)

function arbEmptyParaBlock(): fc.Arbitrary<Block> {
  return arbBlockId().map((id) => ({
    id,
    type: "paragraph" as BlockType,
    content: makeBlockContent(""),
  }) as unknown as Block);
}

function arbWhitespaceParagraphBlock(): fc.Arbitrary<Block> {
  return fc.record({
    id: arbBlockId(),
    content: fc.constantFrom(
      makeBlockContent(" "),
      makeBlockContent("\t"),
      makeBlockContent("   "),
    ),
  }).map(({ id, content }) => ({
    id,
    type: "paragraph" as BlockType,
    content,
  }) as unknown as Block);
}

function arbDividerBlock(): fc.Arbitrary<Block> {
  return arbBlockId().map((id) => ({
    id,
    type: "divider" as BlockType,
    content: makeBlockContent(""),
  }) as unknown as Block);
}

/**
 * Generator for the 5 true-isEmpty variants from REQ-003/REQ-004:
 * 1. single-empty-para, 2. multi-empty-para, 3. whitespace-para,
 * 4. divider-only, 5. divider-and-empty
 */
function arbEmptyNoteBlocks(): fc.Arbitrary<ReadonlyArray<Block>> {
  return fc.oneof(
    arbEmptyParaBlock().map((b) => [b] as ReadonlyArray<Block>),
    fc.tuple(arbEmptyParaBlock(), arbEmptyParaBlock()).map(([a, b]) => [a, b] as ReadonlyArray<Block>),
    arbWhitespaceParagraphBlock().map((b) => [b] as ReadonlyArray<Block>),
    arbDividerBlock().map((b) => [b] as ReadonlyArray<Block>),
    fc.tuple(arbDividerBlock(), arbEmptyParaBlock()).map(([d, p]) => [d, p] as ReadonlyArray<Block>),
  );
}

function arbNote(fm: fc.Arbitrary<Frontmatter>): fc.Arbitrary<Note> {
  return fc
    .record({
      id: arbNoteId(),
      blocks: arbEmptyNoteBlocks(),
      frontmatter: fm,
    })
    .map((n) => ({
      id: n.id,
      blocks: n.blocks,
      frontmatter: n.frontmatter,
    }) as unknown as Note);
}

function arbDirtyEditingSession(
  trigger: "idle" | "blur",
  fm: fc.Arbitrary<Frontmatter>,
): fc.Arbitrary<DirtyEditingSession> {
  return arbNote(fm).map(
    (note) =>
      ({
        kind: "DirtyEditingSession",
        noteId: (note as any).id,
        note,
        previousFrontmatter: null,
        trigger,
      }) as DirtyEditingSession,
  );
}

// Clock returns timestamp well after createdAt (1_000_000–1_500_000)
function makeFixedClockNow(): () => Timestamp {
  return () => ({ epochMillis: 2_000_000_000 } as unknown as Timestamp);
}

// ── PROP-004 ───────────────────────────────────────────────────────────────

describe("PROP-004: empty body + blur trigger → ValidatedSaveRequest (does NOT discard)", () => {
  test("∀ note with isEmpty=true and trigger=blur → result.ok=true and kind='validated'", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true, // empty body
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        // Must be on the success channel
        if (!result.ok) return false;
        // Must be validated (proceeds to save), NOT empty-discarded
        return result.value.kind === "validated";
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ note with isEmpty=true and trigger=blur → EmptyNoteDiscarded is NOT emitted", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const published: Array<{ kind: string }> = [];
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: (e) => published.push(e as { kind: string }),
        };

        prepareSaveRequest(deps)(session);

        // No empty-note-discarded event must be emitted on blur
        return !published.some((e) => e.kind === "empty-note-discarded");
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  test("∀ note with isEmpty=true and trigger=blur → result is never an error", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        return result.ok === true;
      }),
      { numRuns: 200, seed: 13 },
    );
  });

  test("∀ note with isEmpty=true and trigger=blur → validated request carries trigger='blur'", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        if (!result.ok) return false;
        if (result.value.kind !== "validated") return false;
        return result.value.request.trigger === "blur";
      }),
      { numRuns: 100, seed: 99 },
    );
  });

  // ── Sprint 2 (REQ-004 acceptance / PROP-024 partial): blocks reference preserved ──
  // RED: fails because prepareSaveRequest does not set request.blocks yet.

  test("Sprint 2: ∀ note with isEmpty=true and trigger=blur → request.blocks === note.blocks (REQ-002/REQ-004)", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        if (!result.ok) return false;
        if (result.value.kind !== "validated") return false;
        // REQ-002: blocks must be the same reference as note.blocks
        return result.value.request.blocks === (session.note as any).blocks;
      }),
      { numRuns: 100, seed: 42 },
    );
  });

  test("Sprint 2: ∀ isEmpty=true + blur → request.body === serializeBlocksToMarkdown(request.blocks) (REQ-018)", () => {
    // PROP-004 note (FIND-020): body bytes vary by variant.
    // This asserts the invariant body = serializeBlocksToMarkdown(blocks) regardless of content.
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        if (!result.ok) return false;
        if (result.value.kind !== "validated") return false;
        const request = result.value.request;
        const expectedBody = serializeBlocksToMarkdown(request.blocks);
        return (request.body as unknown as string) === expectedBody;
      }),
      { numRuns: 100, seed: 7 },
    );
  });
});
