/**
 * PROP-002: Serializer delegation equality.
 *   bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks) for all valid Notes.
 *
 * Sprint 3 migration: replaces the old "body identity" test (`note.body as string`).
 * The arbitrary now produces block-shaped Notes `{ id, blocks, frontmatter }`.
 * The expected value is computed independently via the canonical serializer.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 * REQ: REQ-002, REQ-013
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import { arbNote } from "./_arbitraries";

describe("PROP-002: bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)", () => {
  test("∀ block-shaped note: bodyForClipboard equals serializeBlocksToMarkdown(note.blocks)", () => {
    fc.assert(
      fc.property(arbNote(), (note) => {
        const actual = bodyForClipboard(note);
        const expected = serializeBlocksToMarkdown(note.blocks);
        return actual === expected;
      }),
      { numRuns: 1000, seed: 17 },
    );
  });
});
