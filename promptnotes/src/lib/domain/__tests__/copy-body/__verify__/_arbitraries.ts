/**
 * Shared fast-check arbitraries for CopyBody property tests.
 *
 * Sprint 3 migration: Note shape is now `{ id, blocks, frontmatter }`.
 * The old `arbBody` / `arbNote` (which used `note.body: Body`) are replaced
 * with blocks-based counterparts. `arbStateAndNote` shape is unchanged.
 *
 * Block invariants enforced (aggregates.md §1 Block):
 *   - paragraph / heading-* / bullet / numbered / quote → single-line content (no \n)
 *   - code → multi-line content OK
 *   - divider → empty content
 *   - BlockId: uuid-style branded string
 */

import fc from "fast-check";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";

// ── Primitive helpers ─────────────────────────────────────────────────────

export function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000_000, max: 2_000_000_000 })
    .map((ms) => ({ epochMillis: ms }) as unknown as Timestamp);
}

export function arbTag(): fc.Arbitrary<Tag> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

export function arbFrontmatter(): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(),
      updatedAt: arbTimestamp(),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

export function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

// ── Block-level arbitraries ───────────────────────────────────────────────

/**
 * Generates a fresh BlockId as a branded string.
 * Uses uuid-style generation for uniqueness within a test run.
 */
export function arbBlockId(): fc.Arbitrary<BlockId> {
  return fc.uuid().map((u) => u as unknown as BlockId);
}

/**
 * Generates one of the 9 canonical BlockType values.
 */
export function arbBlockType(): fc.Arbitrary<BlockType> {
  return fc.constantFrom<BlockType>(
    "paragraph",
    "heading-1",
    "heading-2",
    "heading-3",
    "bullet",
    "numbered",
    "code",
    "quote",
    "divider",
  );
}

/**
 * Generates single-line BlockContent (no \n) for inline block types.
 * Controls chars are excluded.
 */
function arbSingleLineBlockContent(maxLength = 100): fc.Arbitrary<BlockContent> {
  return fc
    .string({ maxLength })
    .filter((s) => !s.includes("\n") && !/[\x00-\x08\x0B-\x1F]/.test(s))
    .map((s) => s as unknown as BlockContent);
}

/**
 * Generates multi-line BlockContent for code blocks.
 */
function arbMultiLineBlockContent(maxLength = 200): fc.Arbitrary<BlockContent> {
  return fc
    .string({ maxLength })
    .filter((s) => !/[\x00-\x08\x0B-\x1F]/.test(s))
    .map((s) => s as unknown as BlockContent);
}

/**
 * Generates BlockContent appropriate for the given BlockType.
 *
 * Invariants (aggregates.md §1):
 *   - divider → always ""
 *   - code → multi-line OK
 *   - all others → single-line (no \n)
 */
export function arbBlockContent(type: BlockType): fc.Arbitrary<BlockContent> {
  switch (type) {
    case "divider":
      return fc.constant("" as unknown as BlockContent);
    case "code":
      return arbMultiLineBlockContent();
    default:
      return arbSingleLineBlockContent();
  }
}

/**
 * Generates a single Block with type-appropriate content.
 * BlockId is always fresh (uuid).
 */
export function arbBlock(): fc.Arbitrary<Block> {
  return arbBlockType().chain((type) =>
    fc.record({
      id: arbBlockId(),
      content: arbBlockContent(type),
    }).map(({ id, content }) => ({
      id,
      type,
      content,
    }) as unknown as Block),
  );
}

/**
 * Generates a non-empty ReadonlyArray<Block> (length ≥ 1).
 * Invariant: at least 1 block (aggregates.md §1 Note invariant 3).
 */
export function arbBlocks(): fc.Arbitrary<ReadonlyArray<Block>> {
  return fc.array(arbBlock(), { minLength: 1, maxLength: 10 });
}

// ── Note arbitrary ────────────────────────────────────────────────────────

/**
 * Generates a block-shaped Note: `{ id, blocks, frontmatter }`.
 * No `body` field — body is derived via serializeBlocksToMarkdown(note.blocks).
 */
export function arbNote(): fc.Arbitrary<Note> {
  return fc.record({
    id: arbNoteId(),
    blocks: arbBlocks(),
    frontmatter: arbFrontmatter(),
  }) as fc.Arbitrary<Note>;
}

// ── State + Note pair ─────────────────────────────────────────────────────

/**
 * Generates an (EditingState, Note) pair where note.id === state.currentNoteId
 * (REQ-012 caller invariant).
 */
export function arbStateAndNote(): fc.Arbitrary<{ state: EditingState; note: Note }> {
  return arbNote().map((note) => ({
    state: {
      status: "editing",
      currentNoteId: note.id,
      isDirty: false,
      lastInputAt: null,
      idleTimerHandle: null,
      lastSaveResult: null,
    } as EditingState,
    note,
  }));
}

// ── Factory helper ────────────────────────────────────────────────────────

/**
 * Constructs a Block with a fresh BlockId. Used in fixture code that
 * needs multiple blocks without copy-pasting the `as unknown as BlockId` cast.
 */
export function makeBlock(type: BlockType, content: string): Block {
  const id = crypto.randomUUID() as unknown as BlockId;
  return {
    id,
    type,
    content: content as unknown as BlockContent,
  } as unknown as Block;
}
