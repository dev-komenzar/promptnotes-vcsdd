/**
 * PROP-024: Body/blocks coherence — at every construction/emission site,
 * `body === serializeBlocksToMarkdown(blocks)` for ValidatedSaveRequest,
 * SaveNoteRequested, and NoteFileSaved.
 *
 * Tier 1 — fast-check property test + example-based pipeline integration.
 * Required: true (REQ-018)
 *
 * Three sub-claims:
 *   (A) fast-check: build ValidatedSaveRequest via buildValidatedSaveRequest factory
 *       from arbitrary Block[], assert request.body === serializeBlocksToMarkdown(request.blocks)
 *   (B) example: pipeline emits SaveNoteRequested with
 *       .body === serializeBlocksToMarkdown(.blocks)
 *   (C) example: pipeline emits NoteFileSaved with
 *       .body === serializeBlocksToMarkdown(.blocks)
 *
 * RED phase: tests fail because:
 *   - buildValidatedSaveRequest factory does not exist yet
 *   - ValidatedSaveRequest in the impl lacks .blocks field
 *   - SaveNoteRequested emitted in pipeline lacks .blocks field
 *   - NoteFileSaved emitted in pipeline lacks .blocks field
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type { Block } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent, NoteId, Frontmatter, Timestamp, Tag, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type { PublicDomainEvent, NoteFileSaved, SaveNoteRequested } from "promptnotes-domain-types/shared/events";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import type { EditingState, SavingState, SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { Note } from "promptnotes-domain-types/shared/note";

// ── Factory import (will fail RED: does not exist yet) ────────────────────
// REQ-018: The factory function `buildValidatedSaveRequest` MUST exist and derive
// body from serializeBlocksToMarkdown(blocks) atomically.
import { buildValidatedSaveRequest } from "$lib/domain/capture-auto-save/build-validated-save-request";

// serializeBlocksToMarkdown is the pure Shared Kernel function
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";

import {
  captureAutoSave,
  type CaptureAutoSavePorts,
} from "$lib/domain/capture-auto-save/pipeline";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(min = 1_000_000, max = 2_000_000_000): fc.Arbitrary<Timestamp> {
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

function arbBlockContent(maxLength = 100): fc.Arbitrary<BlockContent> {
  // BlockContent is a branded string; avoid control chars and newlines for inline types
  return fc
    .string({ maxLength })
    .filter((s) => !/[\x00-\x1F]/.test(s))
    .map((s) => s as unknown as BlockContent);
}

function arbBlockType(): fc.Arbitrary<BlockType> {
  return fc.constantFrom<BlockType>(
    "paragraph",
    "heading-1",
    "heading-2",
    "heading-3",
    "bullet",
    "numbered",
    "quote",
  );
}

/** Generates a single non-divider block. */
function arbInlineBlock(): fc.Arbitrary<Block> {
  return fc.record({
    id: arbBlockId(),
    type: arbBlockType(),
    content: arbBlockContent(80),
  }).map((b) => b as unknown as Block);
}

/** Generates a divider block. */
function arbDividerBlock(): fc.Arbitrary<Block> {
  return arbBlockId().map((id) => ({
    id,
    type: "divider" as BlockType,
    content: "" as unknown as BlockContent,
  }) as unknown as Block);
}

/** Generates a paragraph block with given content. */
function arbParagraphBlock(content?: BlockContent): fc.Arbitrary<Block> {
  const contentArb = content
    ? fc.constant(content)
    : arbBlockContent(100);
  return fc.record({
    id: arbBlockId(),
    content: contentArb,
  }).map(({ id, content: c }) => ({
    id,
    type: "paragraph" as BlockType,
    content: c,
  }) as unknown as Block);
}

/** Generates an arbitrary non-empty Block[]. At least 1 block. */
function arbBlocks(): fc.Arbitrary<ReadonlyArray<Block>> {
  return fc.array(
    fc.oneof(arbInlineBlock(), arbDividerBlock()),
    { minLength: 1, maxLength: 10 },
  );
}

// ── Test helpers ──────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeFrontmatter(overrides: Partial<{
  tags: Tag[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}> = {}): Frontmatter {
  return {
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? makeTimestamp(1000),
    updatedAt: overrides.updatedAt ?? makeTimestamp(2000),
  } as unknown as Frontmatter;
}

function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}

function makeBlockContent(raw: string): BlockContent {
  return raw as unknown as BlockContent;
}

function makeParagraphBlock(content: string, id = "block-001"): Block {
  return {
    id: makeBlockId(id),
    type: "paragraph",
    content: makeBlockContent(content),
  } as unknown as Block;
}

function makeNote(blocks: ReadonlyArray<Block>): Note {
  return {
    id: makeNoteId("test-note-00001"),
    blocks,
    frontmatter: makeFrontmatter(),
  } as unknown as Note;
}

function makeEditingState(): EditingState {
  return {
    status: "editing",
    currentNoteId: makeNoteId("test-note-00001"),
    isDirty: true,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  } as EditingState;
}

function makeSavingState(noteId: NoteId, now: Timestamp): SavingState {
  return {
    status: "saving",
    currentNoteId: noteId,
    savingStartedAt: now,
  } as SavingState;
}

type EmittedEvent = { kind: string; [key: string]: unknown };

function makePipelinePorts(
  blocks: ReadonlyArray<Block>,
  emitted: EmittedEvent[] = [],
): CaptureAutoSavePorts {
  const note = makeNote(blocks);
  return {
    clockNow: () => makeTimestamp(5000),
    allocateNoteId: (_preferred: Timestamp) => makeNoteId("allocated"),
    clipboardWrite: (_text: string) => ({ ok: true, value: undefined } as Result<void, FsError>),
    publish: (e: PublicDomainEvent) => emitted.push(e as unknown as EmittedEvent),
    noteIsEmpty: () => false,
    writeFileAtomic: (_path: string, _content: string) => ({ ok: true, value: undefined } as Result<void, FsError>),
    vaultPath: "/vault" as unknown as VaultPath,
    getCurrentNote: () => note,
    getPreviousFrontmatter: () => null,
    refreshSort: () => {},
    applyTagDelta: () => false,
    emitInternal: () => {},
    beginAutoSave: (state: EditingState, now: Timestamp) =>
      makeSavingState(state.currentNoteId, now),
    onSaveSucceeded: (state: SavingState, _now: Timestamp) =>
      ({
        status: "editing",
        currentNoteId: state.currentNoteId,
        isDirty: false,
        lastInputAt: null,
        idleTimerHandle: null,
        lastSaveResult: "success",
      }) as EditingState,
    onSaveFailed: (state: SavingState, error: SaveError) =>
      ({
        status: "save-failed",
        currentNoteId: state.currentNoteId,
        pendingNextFocus: null,
        lastSaveError: error,
      }) as unknown as SaveFailedState,
  } as CaptureAutoSavePorts;
}

// ── PROP-024 Sub-claim A: factory coherence via fast-check ────────────────

describe("PROP-024 (A): buildValidatedSaveRequest factory — body === serializeBlocksToMarkdown(blocks)", () => {
  test("∀ Block[]: buildValidatedSaveRequest derives body atomically", () => {
    fc.assert(
      fc.property(
        arbBlocks(),
        arbNoteId(),
        arbFrontmatter(),
        arbTimestamp(),
        fc.constantFrom("idle" as const, "blur" as const),
        (blocks, noteId, frontmatter, requestedAt, trigger) => {
          // REQ-018: factory must set body = serializeBlocksToMarkdown(blocks)
          const request = buildValidatedSaveRequest(
            noteId,
            blocks,
            frontmatter,
            null,
            trigger,
            requestedAt,
          );

          const expected = serializeBlocksToMarkdown(blocks);
          return (request.body as unknown as string) === expected;
        },
      ),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ Block[]: request.kind === 'ValidatedSaveRequest'", () => {
    fc.assert(
      fc.property(
        arbBlocks(),
        arbNoteId(),
        arbFrontmatter(),
        arbTimestamp(),
        fc.constantFrom("idle" as const, "blur" as const),
        (blocks, noteId, frontmatter, requestedAt, trigger) => {
          const request = buildValidatedSaveRequest(
            noteId,
            blocks,
            frontmatter,
            null,
            trigger,
            requestedAt,
          );
          return request.kind === "ValidatedSaveRequest";
        },
      ),
      { numRuns: 100, seed: 7 },
    );
  });

  test("∀ Block[]: request.blocks is the same array reference passed in", () => {
    fc.assert(
      fc.property(
        arbBlocks(),
        arbNoteId(),
        arbFrontmatter(),
        arbTimestamp(),
        (blocks, noteId, frontmatter, requestedAt) => {
          const request = buildValidatedSaveRequest(
            noteId,
            blocks,
            frontmatter,
            null,
            "idle",
            requestedAt,
          );
          // blocks must be the same reference (REQ-002 acceptance)
          return request.blocks === blocks;
        },
      ),
      { numRuns: 100, seed: 13 },
    );
  });

  test("example: single paragraph block — body equals its text", () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("hello world"),
    ];
    const noteId = makeNoteId("test-note-00001");
    const frontmatter = makeFrontmatter();
    const requestedAt = makeTimestamp(5000);

    const request = buildValidatedSaveRequest(noteId, blocks, frontmatter, null, "idle", requestedAt);

    const expected = serializeBlocksToMarkdown(blocks);
    expect(request.body as unknown as string).toBe(expected);
    expect(request.kind).toBe("ValidatedSaveRequest");
  });
});

// ── PROP-024 Sub-claim B: SaveNoteRequested.body === serializeBlocksToMarkdown(.blocks) ──

describe("PROP-024 (B): SaveNoteRequested emitted by pipeline has coherent body/blocks", () => {
  test("SaveNoteRequested.body === serializeBlocksToMarkdown(SaveNoteRequested.blocks)", async () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("test content"),
    ];
    const emitted: EmittedEvent[] = [];
    const state = makeEditingState();

    await captureAutoSave(makePipelinePorts(blocks, emitted))(state, "idle");

    const requested = emitted.filter((e) => e.kind === "save-note-requested") as unknown as SaveNoteRequested[];
    expect(requested.length).toBe(1);

    const event = requested[0];
    // REQ-018: body must equal serializeBlocksToMarkdown(blocks)
    expect(event).toBeDefined();
    const expectedBody = serializeBlocksToMarkdown(event.blocks);
    expect(event.body as unknown as string).toBe(expectedBody);
  });

  test("SaveNoteRequested.blocks carries the note's full block array", async () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("first block", "block-001"),
      makeParagraphBlock("second block", "block-002"),
    ];
    const emitted: EmittedEvent[] = [];
    const state = makeEditingState();

    await captureAutoSave(makePipelinePorts(blocks, emitted))(state, "blur");

    const requested = emitted.filter((e) => e.kind === "save-note-requested") as unknown as SaveNoteRequested[];
    expect(requested.length).toBe(1);
    expect((requested[0].blocks as ReadonlyArray<Block>).length).toBe(2);
  });
});

// ── PROP-024 Sub-claim C: NoteFileSaved.body === serializeBlocksToMarkdown(.blocks) ──

describe("PROP-024 (C): NoteFileSaved emitted by pipeline has coherent body/blocks", () => {
  test("NoteFileSaved.body === serializeBlocksToMarkdown(NoteFileSaved.blocks)", async () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("note content"),
    ];
    const emitted: EmittedEvent[] = [];
    const state = makeEditingState();

    await captureAutoSave(makePipelinePorts(blocks, emitted))(state, "idle");

    const saved = emitted.filter((e) => e.kind === "note-file-saved") as unknown as NoteFileSaved[];
    expect(saved.length).toBe(1);

    const event = saved[0];
    const expectedBody = serializeBlocksToMarkdown(event.blocks);
    expect(event.body as unknown as string).toBe(expectedBody);
  });

  test("NoteFileSaved.blocks matches the blocks from the save request", async () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("abc", "block-001"),
    ];
    const emitted: EmittedEvent[] = [];
    const state = makeEditingState();

    const result = await captureAutoSave(makePipelinePorts(blocks, emitted))(state, "idle");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = result.value;
    expect((saved.blocks as ReadonlyArray<Block>).length).toBe(1);
    // body must be derived, not independently set
    expect(saved.body as unknown as string).toBe(serializeBlocksToMarkdown(saved.blocks));
  });
});
