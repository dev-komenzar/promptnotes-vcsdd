/**
 * parserParity.test.ts — PROP-FEED-S4-016 TS side.
 *
 * PROP-FEED-S4-016: parser parity verification — TS half.
 * Paired with: promptnotes/src-tauri/tests/feed_handlers.rs::prop_s4_016* (Rust half)
 *
 * Purpose: Assert that the TS parseMarkdownToBlocks function produces
 * structurally equivalent output to the Rust parse_markdown_to_blocks for
 * the canonical fixture and the basic 6-case suite.
 *
 * Design notes:
 *   - ID fields are excluded from assertions (positional scheme block-N is
 *     identical in both implementations, but IDs are not a cross-language
 *     contract guarantee).
 *   - The TS implementation returns Ok([]) for empty / whitespace-only input
 *     (PROP-031 invariant), whereas the Rust implementation returns
 *     Ok([{type:"paragraph", content:""}]) (non-empty invariant). This
 *     intentional divergence is documented here and does NOT constitute a
 *     parity failure for the Sprint 4 gate: the gate requires parity on the
 *     CANONICAL FIXTURE ("# heading\n\nparagraph"), not on the empty case.
 *   - Spec reference: verification-architecture.md §13 PROP-FEED-S4-016,
 *     behavioral-spec.md line 759.
 */

import { describe, test, expect } from 'bun:test';
import { parseMarkdownToBlocks } from '$lib/domain/capture-auto-save/parse-markdown-to-blocks';

// ── Canonical fixture (spec line 759) ────────────────────────────────────────

/**
 * PROP-FEED-S4-016 canonical snapshot: "# heading\n\nparagraph"
 * Paired with: prop_s4_016b_canonical_two_block_snapshot in feed_handlers.rs
 *
 * Expected:
 *   [0] { type: "heading-1", content: "heading" }
 *   [1] { type: "paragraph", content: "paragraph" }
 */
describe('PROP-FEED-S4-016 canonical fixture snapshot (TS half)', () => {
  test('parse_markdown_to_blocks("# heading\\n\\nparagraph") → 2 blocks: heading-1 then paragraph', () => {
    const result = parseMarkdownToBlocks('# heading\n\nparagraph');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const blocks = result.value.map(b => ({ type: b.type, content: b.content }));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: 'heading-1', content: 'heading' });
    expect(blocks[1]).toEqual({ type: 'paragraph', content: 'paragraph' });
  });
});

// ── Basic 6-case suite (mirroring prop_s4_016_parse_markdown_to_blocks_basic_cases) ──

/**
 * PROP-FEED-S4-016 basic 6-case parity suite.
 *
 * NOTE on empty-string divergence:
 *   TS:   Ok([])             — PROP-031 invariant (no paragraph("") for blank input)
 *   Rust: Ok([paragraph("")]) — non-empty invariant
 * This divergence is intentional and spec-acknowledged. The empty case is
 * tested here to document the TS behavior; cross-language parity is only
 * required for the canonical fixture above.
 */
describe('PROP-FEED-S4-016 basic 6-case parity (TS half)', () => {
  test('empty string → Ok([]) (TS PROP-031: no paragraph("") for blank input)', () => {
    const result = parseMarkdownToBlocks('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // TS returns empty array for blank input (contrast: Rust returns [paragraph("")])
    expect(result.value).toHaveLength(0);
  });

  test('single paragraph "hello" → Ok([{ type: "paragraph", content: "hello" }])', () => {
    const result = parseMarkdownToBlocks('hello');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocks = result.value.map(b => ({ type: b.type, content: b.content }));
    expect(blocks).toEqual([{ type: 'paragraph', content: 'hello' }]);
  });

  test('two paragraphs "p1\\n\\np2" → Ok([paragraph("p1"), paragraph("p2")])', () => {
    const result = parseMarkdownToBlocks('p1\n\np2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocks = result.value.map(b => ({ type: b.type, content: b.content }));
    expect(blocks).toEqual([
      { type: 'paragraph', content: 'p1' },
      { type: 'paragraph', content: 'p2' },
    ]);
  });

  test('heading-1 "# h" → Ok([{ type: "heading-1", content: "h" }])', () => {
    const result = parseMarkdownToBlocks('# h');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocks = result.value.map(b => ({ type: b.type, content: b.content }));
    expect(blocks).toEqual([{ type: 'heading-1', content: 'h' }]);
  });

  test('bullet "- a" → Ok([{ type: "bullet", content: "a" }])', () => {
    const result = parseMarkdownToBlocks('- a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocks = result.value.map(b => ({ type: b.type, content: b.content }));
    expect(blocks).toEqual([{ type: 'bullet', content: 'a' }]);
  });

  test('code block "```\\ncode\\n```" → Ok([{ type: "code", content: "code" }])', () => {
    const result = parseMarkdownToBlocks('```\ncode\n```');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blocks = result.value.map(b => ({ type: b.type, content: b.content }));
    expect(blocks).toEqual([{ type: 'code', content: 'code' }]);
  });
});
