// app-startup/hydrate-note.ts
// Pure ACL function: NoteFileSnapshot → Result<Note, HydrationFailureReason>
//
// REQ-002 (rev8): HydrateNote is called in Step 3 (hydrateFeed), NOT in Step 2.
//   It composes parseMarkdownToBlocks + Note construction from snapshot fields.
//   HydrateNote is a pure pass-through: it does NOT filter blocks from the parser.
//   The parser contract (PROP-031) guarantees no paragraph('') blocks are emitted.
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
//   - All other cases → Ok(Note)

import type { Result } from "promptnotes-domain-types/util/result";
import type { Note, Block } from "promptnotes-domain-types/shared/note";
import type { HydrationFailureReason, NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
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
 * REQ-002 (rev8) / PROP-027: pure pass-through — hydrateNote does NOT filter blocks.
 * The parser contract (PROP-031) guarantees no paragraph('') artifacts are emitted.
 * BlockIds from the parser output are preserved unchanged (no reassignment).
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

  // PROP-029 / aggregates.md §1.5 invariant 6: Ok([]) violates blocks.length >= 1.
  // This path is reached when the parser returns an empty block array (whitespace-only body).
  if (blocksResult.value.length === 0) {
    return { ok: false, error: "block-parse" };
  }

  // REQ-002 (rev8): pass all blocks through unchanged — no filtering, no BlockId reassignment.
  const blocks: ReadonlyArray<Block> = blocksResult.value;

  const note: Note = {
    id: snapshot.noteId,
    blocks,
    frontmatter: snapshot.frontmatter,
  };

  return { ok: true, value: note };
}
