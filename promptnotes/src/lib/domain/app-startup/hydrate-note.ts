// app-startup/hydrate-note.ts
// Pure ACL function: NoteFileSnapshot → Result<Note, HydrationFailureReason>
//
// REQ-002 (rev7): HydrateNote is called in Step 3 (hydrateFeed), NOT in Step 2.
//   It composes parseMarkdownToBlocks + Note construction from snapshot fields.
// REQ-008 (rev7): hydrateFeed calls HydrateNote per snapshot to materialize Note aggregates.
//   HydrateNote purity is the load-bearing claim that keeps hydrateFeed pure.
//
// PROP-027: HydrateNote is referentially transparent — same NoteFileSnapshot always
//   produces the same Result<Note, HydrationFailureReason>.
//   No I/O, no clock, no Vault state read.
//
// Failure modes (PROP-027):
//   - parseMarkdownToBlocks(snapshot.body) returns Err → Err('block-parse')
//   - parseMarkdownToBlocks(snapshot.body) returns Ok([]) → Err('block-parse')
//     (aggregates.md §1.5 invariant 6: blocks.length >= 1)
//   - After filtering empty-paragraph blank-line artifacts, no blocks remain → Err('block-parse')
//   - All other cases → Ok(Note)
//
// Empty-paragraph filtering: real Markdown files use "\n\n" as block separators.
// parseMarkdownToBlocks produces paragraph("") blocks for blank lines, which are
// structural artifacts of the file format. hydrateNote filters these out and
// reassigns positional BlockIds to the remaining blocks.

import type { Result } from "promptnotes-domain-types/util/result";
import type { Note, Block } from "promptnotes-domain-types/shared/note";
import type { HydrationFailureReason, NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { BlockId } from "promptnotes-domain-types/shared/value-objects";
import {
  parseMarkdownToBlocks as moduleParseMarkdownToBlocks,
  type BlockParseError,
} from "../capture-auto-save/parse-markdown-to-blocks.js";

// ── Type alias for the block parser dependency ─────────────────────────────

type BlockParser = (
  markdown: string
) => Result<ReadonlyArray<Block>, BlockParseError>;

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Pure ACL function: materialize a Note aggregate from a NoteFileSnapshot.
 *
 * Does NOT call FrontmatterParser.parse — frontmatter is already a VO on the snapshot.
 * Re-parses the body via parseMarkdownToBlocks (or the injected blockParser).
 *
 * Filters empty paragraph blocks (blank-line artifacts from real Markdown files) and
 * reassigns positional BlockIds (block-0, block-1, ...) to remaining blocks.
 *
 * Function arity is 1 (PROP-027: unary, pure, no I/O).
 * The optional blockParser param has a default and does NOT count toward .length.
 */
export function hydrateNote(
  snapshot: NoteFileSnapshot,
  blockParser: BlockParser = moduleParseMarkdownToBlocks
): Result<Note, HydrationFailureReason> {
  const blocksResult = blockParser(snapshot.body as unknown as string);

  if (!blocksResult.ok) {
    // Err(BlockParseError) → Err('block-parse')
    return { ok: false, error: "block-parse" };
  }

  // Filter out blank-line artifact blocks (empty paragraph blocks from "\n\n" separators).
  // Real Markdown files use "\n\n" between blocks; parseMarkdownToBlocks emits paragraph("")
  // for each blank line, which hydrateNote strips before constructing the Note.
  const contentBlocks = blocksResult.value.filter(
    (block) =>
      !((block.type as unknown as string) === "paragraph" &&
        (block.content as unknown as string) === "")
  );

  if (contentBlocks.length === 0) {
    // Ok([]) or all-empty-paragraphs violates aggregates.md §1.5 invariant 6 → Err('block-parse')
    return { ok: false, error: "block-parse" };
  }

  // Reassign positional BlockIds (block-0, block-1, ...) after filtering.
  // PROP-027 / PROP-025: positional scheme is deterministic — same snapshot → same IDs.
  const blocks: ReadonlyArray<Block> = contentBlocks.map((block, idx) => ({
    ...block,
    id: `block-${idx}` as unknown as BlockId,
  }));

  const note: Note = {
    id: snapshot.noteId,
    blocks,
    frontmatter: snapshot.frontmatter,
  };

  return { ok: true, value: note };
}
