/**
 * PROP-003: Frontmatter exclusion.
 *
 * Sprint 3: two sub-claims (per verification-architecture.md PROP-003):
 *
 * (a) Sentinel-tag test: a sentinel tag in frontmatter.tags does NOT appear in
 *     the result when the blocks do not contain the sentinel string.
 *     Exclusion holds by construction — bodyForClipboard reads only note.blocks.
 *
 * (b) Proxy-based access check (sprint 3 strengthening): wrap note.frontmatter
 *     in a Proxy that throws on any property access. Assert that bodyForClipboard
 *     completes without the Proxy throwing — proving the function does not touch
 *     frontmatter at all.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 * REQ: REQ-002
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
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
import { arbBlockId, arbBlocks, arbNoteId } from "./_arbitraries";

const SENTINEL = "__SENTINEL_XYZ_42__";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const tag = (s: string): Tag => s as unknown as Tag;

function arbNoteIdLocal(): fc.Arbitrary<NoteId> {
  return fc.stringMatching(/^[a-z0-9-]{10,30}$/).map((s) => s as unknown as NoteId);
}

/**
 * Generates a block array that does not contain the sentinel string in any
 * block's content. Filters at the array level.
 */
function arbBlocksWithoutSentinel(): fc.Arbitrary<ReadonlyArray<Block>> {
  return arbBlocks().filter((blocks) =>
    blocks.every((b) => !(b.content as unknown as string).includes(SENTINEL)),
  );
}

// ── Sub-claim (a): sentinel-tag exclusion ──────────────────────────────────

describe("PROP-003 (a): sentinel tag in frontmatter does not appear in bodyForClipboard result", () => {
  test("∀ note with sentinel-tag in frontmatter and sentinel-free blocks: result excludes sentinel", () => {
    fc.assert(
      fc.property(arbNoteIdLocal(), arbBlocksWithoutSentinel(), (noteId, blocks) => {
        const note: Note = {
          id: noteId,
          blocks,
          frontmatter: {
            tags: [tag(SENTINEL)],
            createdAt: ts(1),
            updatedAt: ts(2),
          } as unknown as Frontmatter,
        } as unknown as Note;
        const out = bodyForClipboard(note);
        return !out.includes(SENTINEL);
      }),
      { numRuns: 500, seed: 31 },
    );
  });
});

// ── Sub-claim (b): Proxy-based access check (sprint 3 strengthening) ────────

describe("PROP-003 (b): bodyForClipboard does not access note.frontmatter at all", () => {
  test("Proxy frontmatter: bodyForClipboard completes without any frontmatter property access", () => {
    // Use a fixed block so the test is deterministic
    const blockId = "blk-proxy-001" as unknown as BlockId;
    const blocks: ReadonlyArray<Block> = [
      {
        id: blockId,
        type: "paragraph" as BlockType,
        content: "proxy test" as unknown as BlockContent,
      } as unknown as Block,
    ];

    const frontmatterProxy = new Proxy({} as Frontmatter, {
      get(_target, prop) {
        throw new Error(
          `PROP-003 violation: bodyForClipboard accessed frontmatter.${String(prop)}`,
        );
      },
      has(_target, prop) {
        throw new Error(
          `PROP-003 violation: bodyForClipboard checked 'in' frontmatter for ${String(prop)}`,
        );
      },
    });

    const note: Note = {
      id: "test-note-proxy" as unknown as NoteId,
      blocks,
      frontmatter: frontmatterProxy,
    } as unknown as Note;

    // If bodyForClipboard reads note.frontmatter, the Proxy will throw.
    expect(() => bodyForClipboard(note)).not.toThrow();
  });

  test("Proxy frontmatter: property test — no frontmatter access for arbitrary blocks", () => {
    fc.assert(
      fc.property(arbNoteIdLocal(), arbBlocks(), (noteId, blocks) => {
        const frontmatterProxy = new Proxy({} as Frontmatter, {
          get(_target, prop) {
            throw new Error(
              `PROP-003 violation: accessed frontmatter.${String(prop)}`,
            );
          },
        });

        const note: Note = {
          id: noteId,
          blocks,
          frontmatter: frontmatterProxy,
        } as unknown as Note;

        let threw = false;
        try {
          bodyForClipboard(note);
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 300, seed: 31 },
    );
  });
});
