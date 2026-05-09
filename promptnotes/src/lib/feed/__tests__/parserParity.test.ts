/**
 * parserParity.test.ts — PROP-FEED-S4-016 TS side.
 *
 * PROP-FEED-S4-016: structural parser agreement (non-empty inputs) — TS half.
 * Paired with: promptnotes/src-tauri/tests/feed_handlers.rs::prop_s4_016* (Rust half)
 *
 * Scope: TS production parser (`$lib/domain/capture-auto-save/parse-markdown-to-blocks`)
 * と Rust IPC parser (`promptnotes/src-tauri/src/editor.rs::parse_markdown_to_blocks`)
 * が **non-empty 入力に対して同一の構造的 Block 配列を返す** ことを保証する。
 *
 * Empty/whitespace-only inputs are intentionally out of scope for this
 * parity test. The two implementations have **architecturally distinct
 * empty-input semantics** (固定済):
 * - TS production: REQ-018 / PROP-031 に従い `Ok([])` を返す
 *   (capture-auto-save の round-trip / blank-line separator policy)
 * - Rust IPC: REQ-FEED-025 に従い `Ok([paragraph("")])` を返す
 *   (IPC boundary の non-empty 不変条件)
 *
 * Empty input is normalized at the IPC boundary on the Rust side.
 * Both behaviors are documented in their respective specs and not
 * subject to parity assertion.
 *
 * FIND-S4-IMPL-iter2-001 resolution: test scope narrowed to "structural
 * parser agreement on non-empty inputs". The empty-string case has been
 * removed from this parity suite. The TS Ok([]) behavior for empty input
 * continues to be tested in capture-auto-save spec tests (REQ-018/PROP-031).
 * The Rust non-empty invariant is asserted by prop_s4_002/prop_s4_003
 * (compose_state_for_select_past_note None-input path) in feed_handlers.rs.
 *
 * Design notes:
 *   - ID fields are excluded from assertions (positional scheme block-N is
 *     identical in both implementations, but IDs are not a cross-language
 *     contract guarantee).
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

// ── Non-empty input parity suite ──────────────────────────────────────────────
//
// PROP-FEED-S4-016 structural agreement on non-empty inputs (TS half).
// Mirrors prop_s4_016_parse_markdown_to_blocks_basic_cases in feed_handlers.rs
// for Cases 2-6 (empty string case excluded — see module doc above).

describe('PROP-FEED-S4-016 structural parser agreement (non-empty inputs) (TS half)', () => {
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
