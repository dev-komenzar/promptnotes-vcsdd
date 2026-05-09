# Phase 1c Spec Review — Findings (iteration-6, lean mode)

**Feature**: `app-startup`
**Reviewer**: vcsdd-adversary (fresh context)
**Mode**: lean
**Timestamp**: 2026-05-08
**Overall verdict**: **PASS** (3 advisory/minor findings; zero blockers)

All FIND-019..026 from iteration-5 are resolved. Three new findings (FIND-027/028/029) are non-blocking and may be addressed in a future spec revision.

---

## FIND-027 — `BlockIdSmartCtor.tryNew` validator behavior on `"block-<n>"` is not pinned in the type contract

- **Dimension**: type_contract_consistency
- **Severity**: advisory (non-blocking)
- **Affects**: PROP-025, PROP-027, PROP-029, PROP-030; `docs/domain/code/ts/src/shared/value-objects.ts:64-76`; `docs/domain/code/ts/src/shared/blocks.ts:11-14`

**Issue**: `value-objects.ts:67` says BlockId format is "実装詳細（UUID v4 or `block-<n>`）" with `tryNew` returning `Result<BlockId, BlockIdError>` where errors are `{kind:'invalid-format'}|{kind:'empty'}`. The spec rev7 narrows `parseMarkdownToBlocks` to use `block-<n>`, which is consistent with the permissive type contract. However, whether `BlockIdSmartCtor.tryNew("block-0")` returns `Ok` or `Err({kind:'invalid-format'})` is unspecified. A Phase 2a TDD harness that constructs `Block` values via `tryNew` cannot deterministically predict the outcome.

**Why advisory, not blocker**: The spec is unambiguous at the behavioral-output level (`parseMarkdownToBlocks(m).blocks[i].id === "block-${i}"`). Phase 2a tests can assert on the value directly without exercising `tryNew`.

**Recommended remediation (optional)**: add a sentence to either `value-objects.ts:tryNew` docstring or to the verification-architecture port contract for `ParseMarkdownToBlocks` clarifying that `tryNew("block-<n>")` is `Ok` for `n: number`.

---

## FIND-028 — PROP-030 (`required:false`) is asymmetric with PROP-023 (`required:true`); both are call-budget invariants

- **Dimension**: spec_ambiguity
- **Severity**: advisory (non-blocking)
- **Affects**: `verification-architecture.md` PROP-030 row (line 192), required-true rationale (lines 204-213)

**Issue**: Both PROP-023 (Clock.now ≤ 2 per pipeline run) and PROP-030 (parseMarkdownToBlocks == 2 per non-corrupt file) are call-budget invariants verified via instrumented call counters. The required-true rationale lists PROP-023 explicitly but omits PROP-030 with no written justification. A defensible justification exists (PROP-023 directly protects Step 3 purity; PROP-030's violation modes are mostly wasted-work, since cases (a) duplicated Step 2 and (b) duplicated Step 3 produce equal Block[] per Q2), but it is not documented.

**Why advisory, not major**: Unlike PROP-027 (which guards the purity boundary), PROP-030's violation modes are dominated by wasted-work rather than correctness.

**Recommended remediation (optional)**: either promote PROP-030 to `required:true`, or add one paragraph to the required-true rationale explaining the structural-guard vs. load-bearing distinction.

---

## FIND-029 — REQ-008 AC ("treat as programming-error invariant violation") lacks a concrete failure contract

- **Dimension**: spec_ambiguity
- **Severity**: minor (non-blocking)
- **Affects**: REQ-008 AC, PROP-001, PROP-027

**Issue**: REQ-008 says "If a snapshot's `HydrateNote` call returns `Err(HydrationFailureReason)` during Step 3 ..., the workflow MUST treat this as a programming-error invariant violation." The phrase "programming-error invariant violation" is not defined elsewhere. Candidate interpretations: throw, return Result.Err, console.error+drop, assert(false). The Result-based no-exception design pinned by `glossary.md §0` makes "throw" inconsistent. A Phase 2a test author must pick one interpretation.

**Why minor, not major**: The branch is "unreachable in normal operation"; Phase 2a may defer the contract to Phase 2b.

**Recommended remediation (optional)**: add one AC line specifying the concrete failure contract (e.g., "Wrap in a `Result.Err({kind:'invariant-violation'})` and propagate up, OR log-and-drop the snapshot").

---

## Routing recommendation

**PASS — proceed to Phase 2a.**

No findings route back to Phase 1a/1b. FIND-027, FIND-028, FIND-029 are advisory and may be addressed in a future spec revision. PROP / BEAD identifier reservation: any future revision must continue from PROP-031+ / BEAD-088+.
