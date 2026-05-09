# FIND-022: PROP-026 roundtrip generators only test paragraph + divider; 5 of 8 BlockTypes are unverified

**Dimension**: verification_readiness
**Category**: test_coverage
**Severity**: minor (advisory)
**Sprint**: 2
**Phase**: 3

## Evidence

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-026-blocks-markdown-roundtrip.harness.test.ts:90-108`

```ts
function arbInlineBlock(): fc.Arbitrary<Block> {
  // Limit to types whose roundtrip is well-defined in the parser
  return fc.record({
    id: arbBlockId(),
    type: fc.constantFrom<BlockType>("paragraph"),  // <-- ONLY paragraph
    content: arbInlineContent(80),
  }).map((b) => b as unknown as Block);
}
// ...
function arbRoundtripBlock(): fc.Arbitrary<Block> {
  return fc.oneof(
    { arbitrary: arbInlineBlock(), weight: 4 },
    { arbitrary: arbDividerBlock(), weight: 1 },
  );
}
```

The example-based tests (lines 119-174) also exercise only `paragraph` and `divider`. There are no roundtrip tests for `heading-1`, `heading-2`, `heading-3`, `bullet`, `numbered`, `code`, or `quote`.

The implementation `serializeBlocksToMarkdown` (`promptnotes/src/lib/domain/capture-auto-save/serialize-blocks-to-markdown.ts:27-52`) explicitly handles all 8 types, and `parseMarkdownToBlocks` (`parse-markdown-to-blocks.ts:82-154`) also tries to round-trip them, but PROP-026 never asserts the round-trip for these 5 types.

## Problem

The verification-architecture (PROP-026, line 179 of `verification-architecture.md`) states:

> `serializeBlocksToMarkdown` ↔ `parseMarkdownToBlocks` structural roundtrip ... Justifies treating `body` as a faithful derived view of `blocks` for downstream Hydration.

The justification — "faithful derived view for Hydration" — only holds if all 8 BlockTypes round-trip. With current tests, a regression in serialization or parsing of `heading-1` (e.g., misordered prefix-matching that consumed `### ` as heading-3 before checking `## `, or vice-versa) would NOT be caught by PROP-026. Spot check: `parse-markdown-to-blocks.ts` does prefix-match heading-3 before heading-2 before heading-1 (lines 114-128), which is correct, but no property test validates this ordering.

Concrete latent risks not exercised:
- `heading-1` content containing leading `## ` (e.g., paragraph text quoted into a heading)
- `bullet` content starting with a digit (round-trip risk if parser mis-detects `numbered`)
- `numbered` block followed immediately by a `bullet` (joiner correctness)
- `code` content containing the literal triple-backtick fence (known limitation, but not asserted)
- `quote` content followed by a paragraph that itself starts with `> ` characters

## Why this is advisory, not blocking

PROP-026 is `required: false` in the verification-architecture, and the impl correctness is partially defended by example-based tests for paragraph/divider plus the broader `serializeBlocksToMarkdown` purity tests in PROP-001/PROP-002. The body coherence invariant (PROP-024) does NOT depend on roundtrip — it only requires `body === serializeBlocksToMarkdown(blocks)`, which holds regardless of parser correctness.

## Recommended fix (could be Sprint 3 or deferred)

Extend `arbInlineBlock` to include all 7 inline BlockTypes:

```ts
type: fc.constantFrom<BlockType>(
  "paragraph", "heading-1", "heading-2", "heading-3",
  "bullet", "numbered", "quote",
),
```

For `code`, add a separate generator that produces multi-line content (avoiding triple-backtick in the content). Add example-based tests for the prefix-collision cases listed above (e.g., a paragraph whose content is `## not a heading`).
