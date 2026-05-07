/**
 * PROP-001: serializeNote is pure — same input always produces identical output.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ ValidatedSaveRequest input, serializeNote(input) === serializeNote(input)
 * This is referential transparency: identical inputs must produce identical outputs
 * regardless of invocation order or count.
 *
 * Sprint 2 update (block-based migration):
 * - The generator now produces Block[] sequences (using block-respecting builders).
 * - ValidatedSaveRequest must have `blocks` field (REQ-002).
 * - The purity claim fn(input) === fn(input) is UNCHANGED — the generator is updated
 *   but the property itself remains the same.
 * - RED: fails if ValidatedSaveRequest.blocks is not present in the impl.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { serializeNote } from "$lib/domain/capture-auto-save/serialize-note";
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
import type { Block } from "promptnotes-domain-types/shared/note";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// serializeBlocksToMarkdown is used to derive body from blocks in the generator
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000_000, max: 2_000_000_000 })
    .map((ms) => ({ epochMillis: ms } as unknown as Timestamp));
}

function arbTag(): fc.Arbitrary<Tag> {
  // Tags are non-empty ascii alphanumeric strings (avoid YAML special chars)
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

function arbFrontmatter(): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(),
      updatedAt: arbTimestamp(),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

// Sprint 2: Block-based arbitraries (replaces the old arbBody() generator)

function arbBlockId(): fc.Arbitrary<BlockId> {
  return fc
    .stringMatching(/^block-[0-9]{1,4}$/)
    .map((s) => s as unknown as BlockId);
}

function arbBlockContent(maxLength = 80): fc.Arbitrary<BlockContent> {
  return fc
    .string({ maxLength })
    .filter((s) => !/[\x00-\x1F\n\r]/.test(s))
    .map((s) => s as unknown as BlockContent);
}

function arbInlineBlock(): fc.Arbitrary<Block> {
  return fc.record({
    id: arbBlockId(),
    type: fc.constantFrom<BlockType>("paragraph"),
    content: arbBlockContent(80),
  }).map((b) => b as unknown as Block);
}

function arbDividerBlock(): fc.Arbitrary<Block> {
  return arbBlockId().map((id) => ({
    id,
    type: "divider" as BlockType,
    content: "" as unknown as BlockContent,
  }) as unknown as Block);
}

/** Sprint 2: Block[] generator (replaces old arbBody). At least 1 block. */
function arbBlocks(): fc.Arbitrary<ReadonlyArray<Block>> {
  return fc.array(
    fc.oneof(arbInlineBlock(), arbDividerBlock()),
    { minLength: 1, maxLength: 8 },
  );
}

/**
 * Sprint 2: ValidatedSaveRequest generator now includes blocks + derived body.
 * body = serializeBlocksToMarkdown(blocks) per REQ-018.
 */
function arbValidatedSaveRequest(): fc.Arbitrary<ValidatedSaveRequest> {
  return fc
    .record({
      noteId: arbNoteId(),
      blocks: arbBlocks(),
      frontmatter: arbFrontmatter(),
      trigger: fc.constantFrom("idle" as const, "blur" as const),
      requestedAt: arbTimestamp(),
    })
    .map(
      (r) => {
        const body = serializeBlocksToMarkdown(r.blocks) as unknown as Body;
        return {
          kind: "ValidatedSaveRequest",
          noteId: r.noteId,
          blocks: r.blocks,
          body,
          frontmatter: r.frontmatter,
          previousFrontmatter: null,
          trigger: r.trigger,
          requestedAt: r.requestedAt,
        } as ValidatedSaveRequest;
      },
    );
}

// ── PROP-001 ───────────────────────────────────────────────────────────────

describe("PROP-001: serializeNote purity (referential transparency)", () => {
  test("∀ input: serializeNote(input) === serializeNote(input)", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const first = serializeNote(request);
        const second = serializeNote(request);
        return first === second;
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ input: calling serializeNote twice yields structurally identical strings", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const results = [serializeNote(request), serializeNote(request), serializeNote(request)];
        return results.every((r) => r === results[0]);
      }),
      { numRuns: 100, seed: 7 },
    );
  });
});
