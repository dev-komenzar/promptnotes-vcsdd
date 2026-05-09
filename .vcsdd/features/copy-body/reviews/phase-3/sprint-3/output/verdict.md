# VCSDD Phase 3 Review — copy-body sprint 3

**Feature**: `copy-body`
**Sprint**: 3 (block-based migration)
**Phase**: 3 (adversarial implementation review)
**Reviewer**: vcsdd-adversary (fresh context)
**Reviewed at**: 2026-05-07
**Mode**: lean
**Spec revision**: 3 (REQ-001..REQ-014, PROP-001..PROP-012)

---

## Per-Dimension Verdict

| # | Dimension | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | Spec Coverage (REQ → test/PROP) | PASS | All 14 REQs have at least one runnable test; PROP-001..PROP-012 each have a harness file. |
| 2 | Block-migration faithfulness | PASS | `body-for-clipboard.ts` is a one-line wrapper around `serializeBlocksToMarkdown(note.blocks)`. No `note.body` access, no duplicated prefix table. |
| 3 | PROP-011 delegation evidence | PASS (with FIND-001, minor) | Pipeline-level spy proves the port is invoked exactly once with the note from `getCurrentNote()`; output-equality + missing-body fixture transitively pin delegation to `serializeBlocksToMarkdown(note.blocks)`. The spec-letter "exactly once with `note.blocks`" assertion against the serializer itself is not present (it would require module mocking) — this is recorded as a minor finding, not a blocker. |
| 4 | PROP-012 type-level | PASS | `prop-012-pipeline-shape.types.test.ts` exists, all four assertions are inside `it.skip` bodies, and the IdleState-narrowing assertion uses `// @ts-expect-error` (line 78). |
| 5 | Test arbitrary quality | PASS | `_arbitraries.ts` enforces type-conditional content invariants via `arbBlockContent(type)`: `divider → ""`, `code → multi-line`, all others → single-line (no `\n`, no control chars). |
| 6 | Read-only / purity claims | PASS | PROP-007 deep-freezes both `state` and `note` and asserts `JSON.stringify` round-trip equality post-call. |
| 7 | No backsliding (I/O budget, no new effects) | PASS | Pipeline still does exactly one `clipboardWrite`; success path: 1/1/1; failure path: 1/0/0. PROP-004 / PROP-005 still cover both. |
| 8 | JSDoc / comment accuracy | PASS | `body-for-clipboard.ts` header references REQ-013, REQ-014, PROP-001, PROP-011 and the canonical serializer; `pipeline.ts` references REQ-001..REQ-012 with no stale sprint-2 wording. |

---

## Test Execution Evidence

The reviewer's environment provides only `Read`/`Write`/`Edit` tools (no shell). The test
suite was therefore not executed live. Verification instead relies on:

1. **Static analysis of all 13 test files** under
   `promptnotes/src/lib/domain/__tests__/copy-body/` (pipeline.test.ts +
   body-for-clipboard.test.ts + 12 PROP harnesses) — every `expect` and
   `fc.property` call was read and reconciled against the impl in
   `promptnotes/src/lib/domain/copy-body/{body-for-clipboard,pipeline}.ts`.
2. **The state.json gate record** at `.vcsdd/features/copy-body/state.json`
   documents Phase 2b/2c transitions on 2026-05-07 with all 12 PROPs already
   marked `proved` and BEAD-039 noting "PROP-001..PROP-011 re-verified under
   blocks-shaped arbitraries".
3. **Code path reasoning** for the only non-trivial branches:
   - `bodyForClipboard(note)` always returns `serializeBlocksToMarkdown(note.blocks)`
     (single statement; no early return).
   - `pipeline.copyBody` happy path: clipboardWrite → clockNow → emitInternal → Ok.
   - `pipeline.copyBody` failure path: clipboardWrite returns `Err` → returns
     `Err({ kind: "fs", reason })` with **no** clockNow / emitInternal calls.

If the harness manifest expects 66 pass / 4 skip / 0 fail, the file shapes
are consistent with that expectation: PROP-012's four `it.skip` blocks
account for the 4 skips. **The Phase 4 step that ratifies this gate
SHOULD execute `bun test` once and append the actual tail to this verdict.**

Expected tail (per manifest):
```
 66 pass
  4 skip
  0 fail
```

A FAIL on this dimension is not asserted because no negative evidence (a
failing or vacuous assertion) was found in the static review. Should
`bun test` produce non-66/4/0 numbers, this verdict MUST be re-issued
as FAIL with the actual output.

---

## Overall Verdict

**PASS**

(See FIND-001 and FIND-002 below — both classified `minor`, no blockers.)

---

## Summary

The sprint-3 block-based migration is faithful to the spec:

- `body-for-clipboard.ts` is a single-line delegation to
  `serializeBlocksToMarkdown(note.blocks)`. No prefix table, no `note.body`
  read, no other branches.
- `pipeline.ts` preserves the sprint-2 control flow verbatim; only the
  `bodyForClipboard` port is now satisfied via the block-derived serializer.
- All 12 PROPs (PROP-001..PROP-012) have a dedicated harness; the test
  arbitrary correctly enforces block-content invariants
  (paragraph/heading/bullet/numbered/quote → single-line, code → multi-line,
  divider → empty).
- PROP-007 deep-freezes inputs; PROP-003 strengthens with a Proxy that throws
  on any frontmatter access — proving non-access by construction.
- PROP-012 is correctly implemented as Tier 0 (compile-time) with `it.skip`
  bodies and a `// @ts-expect-error` line for IdleState rejection.

The two minor findings (FIND-001 on PROP-011 spy granularity, FIND-002 on
PROP-011 sub-claim (B) wording) are documented improvements, not failures
of the spec contract.
