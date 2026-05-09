# Phase 1c Spec Review — Verdict (iteration-6, lean mode)

**Feature**: `app-startup`
**Reviewed artefacts**: `behavioral-spec.md` rev 7, `verification-architecture.md` rev 7
**Reviewer**: vcsdd-adversary (fresh context)
**Mode**: lean (no human-approval requirement; gate is binary PASS/FAIL on adversary verdict only)
**Timestamp**: 2026-05-08
**Iteration**: 6

## Per-dimension verdict

| Dimension | Verdict |
|-----------|---------|
| 1. EARS rigor | **PASS** |
| 2. Edge case coverage | **PASS** |
| 3. Purity boundary correctness | **PASS** |
| 4. Type-contract consistency | **PASS** |
| 5. Traceability | **PASS** |
| 6. Spec ambiguity / hallucination | **PASS** |

## Overall verdict

**PASS**

The rev7 remediation resolves all eight iteration-5 findings (FIND-019..026):

- **FIND-019** (Ok([]) edge case): REQ-017's edge-case enumeration now includes the Ok([]) → reason='block-parse' case at line 361 with rejected alternatives ('invalid-value', auto-pad) explicitly documented. PROP-029 (required:true, Tier 2) verifies the classification.
- **FIND-020** (parseMarkdownToBlocks purity): Q2=A is adopted — deterministic positional BlockId (`block-0..block-N-1`) is now the spec-mandated allocation in `parseMarkdownToBlocks`. PROP-025 uses plain `deepEquals`. The verification-architecture port-contract docstring (lines 88-102) explicitly excludes `BlockIdSmartCtor.generate()` from `parseMarkdownToBlocks`.
- **FIND-021** (HydrateNote composition): The Purity Boundary Map (line 401) and verification-architecture (line 29) state explicitly that `HydrateNote` does NOT call `FrontmatterParser.parse` because the snapshot's frontmatter is already a VO. Consistent with `curate/ports.ts:14-20` HydrateNote docstring which references only `parseMarkdownToBlocks(snapshot.body)`.
- **FIND-022** (ScannedVault.snapshots type): REQ-002 AC line 107 now reads "`ScannedVault.snapshots[i]` is a `NoteFileSnapshot` (NOT a `Note` aggregate)". REQ-008 line 198 is rewritten to match: snapshots are `NoteFileSnapshot[]` whose body is structurally-validated. Consistent with `shared/snapshots.ts:18-24` (NoteFileSnapshot has `body: Body`, no `blocks` field).
- **FIND-023** (REQ-002 line 78): The "single ACL function that performs both frontmatter validation and Markdown→Block parsing" line is replaced by REQ-002's "Per-file operation order in Step 2" section (lines 65-67) which asserts `HydrateNote` is NOT invoked during Step 2.
- **FIND-024** ('unknown' producer): REQ-018 added — defines `'unknown'` as a defensive fallback for non-categorisable hydration failures with explicit producer enumeration in PROP-019, PROP-028.
- **FIND-025** (PROP-027 required asymmetry): PROP-027 promoted to `required: true`; the required-true rationale at line 212 explicitly removes the asymmetry with PROP-025.
- **FIND-026** (REQ-008 PROP-027 entry): Justified by footnote `[^req008-prop027]` on line 241 referencing Q1=A adoption (hydrateFeed calls HydrateNote per snapshot in Step 3).

Three new advisory observations are recorded as findings (FIND-027, FIND-028, FIND-029) but none is a blocker for Phase 2a; see `findings.md`.

## Findings count

3 findings, all advisory (none blocking the gate):
- advisory: 2 (FIND-027, FIND-028)
- minor: 1 (FIND-029)

## Re-gate condition

PASS — proceed to Phase 2a sprint-N (where N continues from the prior sprint counter; per state.json the next sprint after the converged copy-body sprint 3 is sprint 4 for the block-migration spec branch).

The advisory findings (FIND-027, FIND-028, FIND-029) MAY be addressed in a future spec revision but are not gating. Phase 2a may begin without further spec rework.

## What I verified directly (positive evidence)

- `docs/domain/code/ts/src/shared/snapshots.ts` lines 33-38: `HydrationFailureReason = 'yaml-parse' | 'missing-field' | 'invalid-value' | 'block-parse' | 'unknown'` — matches REQ-002 AC line 104 and REQ-018.
- `docs/domain/code/ts/src/shared/snapshots.ts` lines 46-48: `ScanFileFailure` discriminated union with exactly two variants (`'read'` / `'hydrate'`) — matches REQ-002 AC line 103.
- `docs/domain/code/ts/src/shared/snapshots.ts` lines 18-24: `NoteFileSnapshot.body: Body` (raw markdown), no `blocks` field — matches FIND-022 fix.
- `docs/domain/code/ts/src/curate/ports.ts` lines 14-20: `HydrateNote` docstring references only `parseMarkdownToBlocks(snapshot.body)`, no frontmatter parsing — matches FIND-021/FIND-023 fix.
- `docs/domain/code/ts/src/shared/blocks.ts` lines 49-50: `ParseMarkdownToBlocks: (markdown: string) => Result<ReadonlyArray<Block>, BlockParseError>` — pure signature, matches PROP-025 / PROP-029 testability.
- `docs/domain/code/ts/src/shared/value-objects.ts` lines 69-76: `BlockId` brand and `BlockIdSmartCtor.generate()` — type contract permits `"block-<n>"` format; spec rev7 narrows `parseMarkdownToBlocks` to use this scheme exclusively.
- `docs/domain/aggregates.md` line 122 invariant 6 ("blocks は最低 1 ブロックを保持") — consistent with REQ-017's `Ok([])` → `'block-parse'` classification (FIND-019 fix).
- `docs/domain/glossary.md` line 156: HydrationFailureReason includes `'unknown'` — covered by REQ-018 (FIND-024 fix).
- `docs/domain/workflows.md` lines 70-92: Step 2 / Step 3 responsibilities — consistent with rev7 spec's Q1=A two-call invariant (PROP-030).
- Coverage Matrix (verification-architecture.md lines 220-241): every REQ-XXX has at least one PROP-YYY and vice versa; PROP-028 / PROP-029 / PROP-030 are all wired in. Total 18 REQs / 30 PROPs.

The four sub-questions raised by the routing review:

1. **Two-call invariant tightness**: The spec's wording (REQ-002 line 67 + REQ-008 line 198) bounds parseMarkdownToBlocks calls to (Step 2 once per file) + (Step 3 once per non-corrupt file via HydrateNote). PROP-030 instruments a counter and asserts == 2 per non-corrupt file. No third-call sneak path is consistent with the purity-boundary classification — any additional call would have to be inside hydrateFeed (forbidden by PROP-001 purity claim) or in the orchestrator (which only calls Clock.now per REQ-015). Tight.
2. **Deterministic positional BlockId consistency across Step 2 and Step 3**: Both invocations call the same pure `parseMarkdownToBlocks(snapshot.body)`. Same input → same Block[] including BlockId values per Q2. PROP-027 asserts HydrateNote(snapshot) deepEquals HydrateNote(snapshot). Consistent.
3. **REQ-018 testability**: PROP-028 testable via parser stubs that throw and that return casts to non-statically-reachable variants. Not tautological — it has a concrete failure-injection harness.
4. **REQ accidentally referencing HydrateNote in Step 2**: None. REQ-002 line 67 explicitly states "`HydrateNote` is NOT invoked during Step 2"; the Purity Boundary Maps in both spec and verification-architecture repeat the exclusion.
