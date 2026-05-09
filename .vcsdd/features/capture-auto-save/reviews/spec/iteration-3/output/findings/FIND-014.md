# FIND-014: PROP-025 "empty/whitespace-only" predicate is not precisely defined

**Dimension**: verification_readiness
**Severity**: major

## Location
- `verification-architecture.md` PROP-025 (line 144)
- `behavioral-spec.md` REQ-003 (line 92), REQ-004 acceptance (line 124)
- Port Contracts L60: "blocks[0].content is empty/whitespace-only"

## Evidence

PROP-025 description (L144):

> "`Note.isEmpty(note)` block-based definition: returns `true` iff `note.blocks.length === 1` AND `note.blocks[0].type === "paragraph"` AND `note.blocks[0].content` is empty/whitespace-only"

The phrase "empty/whitespace-only" is undefined. Possible interpretations:

1. `content.length === 0` (literally empty string)
2. `content.trim().length === 0` (whitespace-only including U+0020 spaces)
3. `/^\s*$/.test(content)` (any Unicode whitespace, including U+00A0 non-breaking space, tabs, etc.)
4. Whatever `BlockContent` Smart Constructor would normalize to — but per `aggregates.md` L82, BlockContent rejects control characters and removes newlines; it does NOT auto-trim whitespace.

These produce different test results:

- A `BlockContent` containing exactly `" "` (one space) — interpretation (1) → false; (2)(3) → true.
- A `BlockContent` containing `"\t"` (tab) — same.
- A `BlockContent` containing `" "` (non-breaking space) — (1) → false; (2) depends; (3) → true.

`note.ts` L172-174's comment also uses ambiguous wording ("空 content の paragraph") and provides no operational definition.

Without precision, the property test in PROP-025 cannot be written deterministically. The fast-check generator strategy "produces Block[] (single empty paragraph; single non-empty block; multi-block sequences) and asserts the boolean output matches the structural predicate" implicitly assumes both the predicate AND the implementation use the same definition, which becomes circular.

This also creates a downstream risk for REQ-003: a user who types one space and triggers idle save — does the note get discarded (data loss if the space was deliberate) or saved (vault file containing one space)? The behavior is undefined by the current spec.

## Recommended fix

Pick exactly one definition and pin it in REQ-003 and PROP-025:

> Recommended (matches typical user intent and aggregates.md "空" intuition):
> "content is empty-or-whitespace-only" means `content.trim() === ""` where `trim()` is the standard JavaScript `String.prototype.trim` (removes ASCII and Unicode whitespace per ECMA-262).

Then update:
- REQ-003 L92 to use the precise predicate.
- PROP-025 to enumerate:
  - positive cases (`""`, `" "`, `"\t"`, `"  \n"` if newlines were preserved — but BlockContent strips them per aggregates.md L82)
  - negative cases (`"a"`, `" a "`, `"a "`)
- Port Contracts L60 to use the same wording.

If a stricter rule (`length === 0` only) is preferred, document that a single-space note triggers a save on idle and the user must explicitly delete to discard.
