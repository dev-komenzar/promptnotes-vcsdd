# FIND-020: REQ-004 acceptance criterion mischaracterizes serializeBlocksToMarkdown output for divider variants

**Dimension**: spec_fidelity
**Severity**: minor

## Location

- `behavioral-spec.md` REQ-004 Acceptance Criteria, line 155
- Source-of-truth contradicting evidence:
  - `behavioral-spec.md` REQ-003 Empty-Note variants table, lines 118-119 (divider-only, divider-and-empty rows)
  - `docs/domain/aggregates.md` L78 (`divider` Markdown 表現 `---`)
  - `docs/domain/code/ts/src/shared/blocks.ts` L40-44 (`SerializeBlocksToMarkdown` contract)

## Evidence

REQ-004 (Empty body on blur save proceeds to save) Acceptance Criterion #1, `behavioral-spec.md` L155:

> "A `ValidatedSaveRequest` is produced with `isEmpty(note) === true` blocks and `body === serializeBlocksToMarkdown(blocks)` (**typically the empty string or whitespace-only string** per `serializeBlocksToMarkdown` semantics)."

This claim is correct for the three paragraph-shaped empty variants (single-empty-para, multi-empty-para, whitespace-para) but is **factually wrong** for the two divider-shaped variants that the same spec also classifies as `isEmpty()=true` and routes to blur-save:

- `divider-only` variant (REQ-003 table L118): blocks = `[divider]`. Per `aggregates.md` L78, the divider's Markdown representation is `---`. Therefore `serializeBlocksToMarkdown([divider])` is `"---"` (or `"---\n"` depending on terminator policy) — not an empty string and not whitespace-only.
- `divider-and-empty` variant (REQ-003 table L119): blocks = `[divider, paragraph("")]`. Similarly serializes to a string starting with `---`.

The acceptance text "typically the empty string or whitespace-only string" therefore contradicts the variants table that lists these shapes as legitimate blur-save inputs.

This creates two downstream defects:

1. **Verification ambiguity for PROP-004**: PROP-004 description (`verification-architecture.md` L157) says "Empty body on blur trigger proceeds to ValidatedSaveRequest (does NOT discard) — for ALL isEmpty=true variants". A property test that asserts the resulting `request.body` is empty/whitespace-only against `[divider]` will FAIL — because `body === "---"` is neither empty nor whitespace-only. The acceptance criterion as written would falsely make a correct implementation appear to violate the spec.

2. **Hidden file-bytes assertion**: The spec acceptance criteria are also the contract for what gets written to disk on blur. For `[divider]` blur-save the vault file body bytes will literally be `---\n` (or similar). This is a user-observable artifact that the spec implies (via "typically empty/whitespace") will not be a vault file at all. The user-visible behavior must be reconciled.

## Recommended fix

Replace the parenthetical hand-wave with an exhaustive truth statement, or split REQ-004's acceptance into per-variant rows that match the REQ-003 variants table. Suggested rewording for L155:

> "A `ValidatedSaveRequest` is produced with `isEmpty(note) === true` blocks and `body === serializeBlocksToMarkdown(blocks)`. The resulting body string depends on the variant: for paragraph-only variants (single-empty-para, multi-empty-para, whitespace-para), `body` is the empty string or a whitespace-only string; for divider-bearing variants (divider-only, divider-and-empty), `body` contains the literal `---` per the `divider` block Markdown form (`aggregates.md` L78). All cases proceed to Steps 2 and 3."

Then update PROP-004 generator/assertion to NOT assume body is empty/whitespace; the relevant invariant is `body === serializeBlocksToMarkdown(blocks)` (REQ-018), not "body is empty".

## Severity rationale

Minor — does not block Phase 2a since:
- The correct invariant (REQ-018) is well-defined and supersedes the misleading parenthetical.
- Test authors writing PROP-004 against the variants table will likely catch the contradiction.

But marked as a finding because the acceptance criterion is part of the contract that test authors and implementers will read literally, and a contract that is literally wrong for two of five enumerated variants is a spec defect.
