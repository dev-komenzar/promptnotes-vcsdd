# FIND-024: PROP-025 omits Unicode-whitespace cases (NBSP U+00A0, full-width U+3000) explicitly listed in verification-architecture

**Dimension**: edge_case_coverage
**Category**: test_coverage
**Severity**: minor (advisory)
**Sprint**: 2
**Phase**: 3

## Evidence

`.vcsdd/features/capture-auto-save/specs/verification-architecture.md:101-107` (from `IsEmptyOrWhitespaceContent` documentation):

```
 *  Positive cases (isEmpty === true for a sole paragraph with this content):
 *    ""         — empty string
 *    " "        — single ASCII space
 *    "\t"       — tab
 *    "   "      — multiple spaces
 *    " "   — non-breaking space (U+00A0)
 *    "　"   — ideographic space (U+3000, full-width)
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-025-isempty-block-rule.harness.test.ts:202-207` (whitespace generator):

```ts
content: fc.constantFrom(
  makeBlockContent(" "),
  makeBlockContent("\t"),
  makeBlockContent("   "),
),
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-025-isempty-block-rule.harness.test.ts:281-289` (inline predicate test):

```ts
expect(isEmptyOrWhitespace("")).toBe(true);
expect(isEmptyOrWhitespace(" ")).toBe(true);
expect(isEmptyOrWhitespace("\t")).toBe(true);
expect(isEmptyOrWhitespace("   ")).toBe(true);
```

Neither U+00A0 (NBSP) nor U+3000 (ideographic space) appears anywhere in the test file.

## Problem

The verification-architecture explicitly enumerates NBSP and ideographic space as positive cases for `isEmptyOrWhitespaceContent`. The implementation uses `/^\s*$/` (`note-is-empty.ts:22`), and JavaScript's `\s` *does* match both U+00A0 and U+3000 — so the impl is correct. But the property tests do not exercise these characters.

A regression that, e.g., switched the regex to `/^[ \t]*$/` (ASCII-only whitespace) would NOT be caught by any current test. Given the documented intent and Asian-language users (a likely real-world input source for full-width spaces), this is a meaningful coverage gap.

Additionally, the test at line 276-289 ("isEmptyOrWhitespaceContent: /^\\s*$/ matches correct patterns") *re-implements* the predicate inline (`const isEmptyOrWhitespace = (s: string) => /^\s*$/.test(s);`) rather than importing the exported `isEmptyOrWhitespaceContent` from `$lib/domain/capture-auto-save/note-is-empty`. This is a tautological test — it tests the regex itself, not the implementation — and provides zero defense against a regression in the actual exported function.

## Why this is advisory, not blocking

The implementation is correct (verified by reading `note-is-empty.ts:22`). All paragraph-only variants from REQ-003 are exercised in the variant table. The risk is regression-only, not present-state correctness.

## Recommended fix (could be Sprint 3)

1. Add NBSP and full-width-space content cases to `arbEmptyCompatibleBlock`'s whitespace branch:
   ```ts
   fc.constantFrom(
     makeBlockContent(" "),
     makeBlockContent("\t"),
     makeBlockContent("   "),
     makeBlockContent(" "),       // NBSP
     makeBlockContent("　"),       // ideographic space
     makeBlockContent(" 　"), // mixed
   ),
   ```

2. Replace the inline predicate test (lines 276-289) with one that imports and tests the actual exported function:
   ```ts
   import { isEmptyOrWhitespaceContent } from "$lib/domain/capture-auto-save/note-is-empty";
   // ...
   expect(isEmptyOrWhitespaceContent(" ")).toBe(true);
   expect(isEmptyOrWhitespaceContent("　")).toBe(true);
   ```
