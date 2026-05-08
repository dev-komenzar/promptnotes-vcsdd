# Phase 1c Spec Review — Findings (iteration-5, lean mode)

**Feature**: `app-startup`
**Reviewer**: vcsdd-adversary (fresh context)
**Mode**: lean
**Timestamp**: 2026-05-08
**Overall verdict**: FAIL (3 blocker, 4 major, 1 minor)

---

## FIND-019 — Empty `Block[]` from `parseMarkdownToBlocks` is unenumerated and conflicts with Note invariant 6

- **Dimension**: edge_case_coverage
- **Severity**: major
- **Affects**: REQ-002, REQ-017, PROP-025, PROP-026, PROP-027

**Quote** (`behavioral-spec.md` REQ-017 Edge Cases): enumerates only the two `BlockParseError` variants (`unterminated-code-fence`, `malformed-structure`) and the unknown-block carve-out.

**Issue**: REQ-017 does not enumerate the `parseMarkdownToBlocks` returns `Ok([])` case (e.g., body containing only whitespace after frontmatter strip). `aggregates.md §1` 不変条件 6 (line 122) states **"blocks は最低 1 ブロックを保持"**. Therefore `Ok([])` cannot be turned into a valid `Note` aggregate. The spec is silent on whether this folds to (a) `failure: { kind:'hydrate', reason:'block-parse' }`, (b) `failure: { kind:'hydrate', reason:'invalid-value' }`, or (c) auto-pad with an empty paragraph. Phase 2a tests cannot be written deterministically.

**Recommended remediation**: add the `Ok([])` edge case to REQ-017 and pick one classification; document the rejected alternatives.

---

## FIND-020 — `parseMarkdownToBlocks` purity claim is unresolved given `BlockId` allocation freedom

- **Dimension**: purity_boundary
- **Severity**: blocker
- **Affects**: PROP-025 (required:true), purity-boundary map line 27, REQ-002, REQ-017

**Quote** (`verification-architecture.md` PROP-025): "same Markdown input always produces identical Result ... (deep-equal Block tree, **ignoring fresh-allocated BlockId values**)".

**Quote** (`docs/domain/glossary.md` line 12): "BlockId | 形式は実装詳細（UUID v4 or `block-<n>`）".

**Quote** (`docs/domain/code/ts/src/shared/value-objects.ts` line 74-75): "BlockIdSmartCtor.generate(): 実装側は uuid v4 か単調増加の `block-<n>`".

**Issue**: A function with signature `(string) → Result<Block[], BlockParseError>` cannot allocate fresh `BlockId` values without hidden state or randomness. Either (a) `BlockId` is deterministically derived from input position/content, in which case `parseMarkdownToBlocks` is strictly pure and PROP-025 should use vanilla `deepEquals`; or (b) `BlockId` uses UUID v4 / global counter, in which case `parseMarkdownToBlocks` is NOT pure and the "Pure core" classification is wrong. PROP-025's "deepEqualsModuloBlockId" predicate is undefined, so Phase 5 has no operational definition to verify.

**Recommended remediation**: pin `BlockId` allocation in `parseMarkdownToBlocks` to a deterministic scheme (e.g., positional `block-<n>`) in `shared/blocks.ts` docstring, and tighten PROP-025 to exact `deepEquals`. OR introduce a `BlockIdAllocator` port and reclassify `parseMarkdownToBlocks` as Effectful shell (with PROP-025 retargeted to the inner pure helper).

---

## FIND-021 — `HydrateNote` purity description misrepresents what `HydrateNote` actually composes

- **Dimension**: purity_boundary
- **Severity**: blocker
- **Affects**: REQ-002 line 78, PROP-027, purity-boundary map (`verification-architecture.md` lines 26-28), `behavioral-spec.md` line 367

**Quote** (`verification-architecture.md` line 26): "per-file Hydration is delegated to HydrateNote (ACL) which composes the **pure FrontmatterParser.parse** and pure parseMarkdownToBlocks calls".

**Quote** (`docs/domain/code/ts/src/shared/snapshots.ts` lines 18-24): `NoteFileSnapshot.frontmatter: Frontmatter` (already-parsed VO).

**Quote** (`docs/domain/code/ts/src/curate/ports.ts` lines 18-20): docstring says "内部で `parseMarkdownToBlocks(snapshot.body)` を呼び" — does NOT mention `FrontmatterParser.parse`.

**Issue**: By the time a `NoteFileSnapshot` exists, frontmatter has already been parsed (the VO is in the snapshot). `HydrateNote` cannot compose `FrontmatterParser.parse` because it never sees raw YAML. The purity-boundary map and `behavioral-spec.md` line 367 repeatedly describe a composition that does not exist. A tester following the spec would mock the wrong sub-call when writing PROP-027 harnesses.

**Recommended remediation**: state explicitly that `FrontmatterParser.parse` lives in `scanVault`'s per-file loop **before** `NoteFileSnapshot` construction; `HydrateNote` only does Markdown-body→Block[] parsing and Note Aggregate reconstruction.

---

## FIND-022 — `ScannedVault.snapshots` type after block-migration is contradictory between REQ-002 and REQ-008

- **Dimension**: type_contract_consistency
- **Severity**: major
- **Affects**: REQ-002, REQ-008, REQ-013a, PROP-018, PROP-021

**Quote** (REQ-002 line 62-63): "produce a ScannedVault containing **NoteFileSnapshot[]** and corruptedFiles: CorruptedFile[]".

**Quote** (REQ-008 AC line 190 — added in rev 6): "Step 3 receives the ScannedVault whose **snapshots are pre-validated, fully-hydrated `Note` aggregates**".

**Quote** (REQ-013a line 263): `VaultScanned` payload `snapshots: NoteFileSnapshot[]`.

**Issue**: `NoteFileSnapshot` (snapshots.ts) has `body: Body` (raw markdown) and `frontmatter: Frontmatter`; it has no `blocks` field. A `Note` aggregate has `blocks: Block[]` (aggregates.md §1). These two cannot be the same value. The spec also fails to specify whether the `Block[]` from `parseMarkdownToBlocks` is retained on the snapshot, discarded, or recomputed in Step 3. Phase 2a fixture shape is undecidable.

**Recommended remediation**: pick one of (a) keep `NoteFileSnapshot[]` and rewrite REQ-008 line 190; (b) introduce `HydratedSnapshot` and update Shared Kernel types; (c) move `parseMarkdownToBlocks` into Step 3 (pure-core) and strike the existing REQ-008 line 190.

---

## FIND-023 — REQ-002 ACs line 78 contradicts the `HydrateNote` port docstring

- **Dimension**: type_contract_consistency
- **Severity**: major
- **Affects**: REQ-002

**Quote** (`behavioral-spec.md` line 78): "**HydrateNote is the single ACL function that performs both frontmatter validation and Markdown→Block parsing during scanVault.**"

**Quote** (`docs/domain/code/ts/src/curate/ports.ts` lines 18-20): docstring describes only `parseMarkdownToBlocks(snapshot.body)`.

**Issue**: Same root cause as FIND-021 but at the REQ acceptance-criterion level. REQ-002 line 78 is factually false under the pinned type contract.

**Recommended remediation**: rewrite REQ-002 line 78 to: "HydrateNote is the ACL function that performs Markdown→Block parsing on a NoteFileSnapshot. Frontmatter validation occurs upstream in scanVault before NoteFileSnapshot construction; failures from that step are folded into `failure: { kind:'hydrate', reason:'yaml-parse' | 'missing-field' | 'invalid-value' }` directly by scanVault, not via HydrateNote."

---

## FIND-024 — `HydrationFailureReason 'unknown'` is in the union but no REQ specifies its producer

- **Dimension**: type_contract_consistency
- **Severity**: blocker
- **Affects**: REQ-002 line 98, REQ-016, PROP-019, HydrationFailureReason completeness

**Quote** (`behavioral-spec.md` line 98): exhaustive union includes `'unknown'`.

**Quote** (`behavioral-spec.md` line 339, REQ-016 NOTE): "previously, readFile failures were mis-classified as reason: 'unknown' HydrationFailureReason — that classification is incorrect."

**Issue**: After REQ-016 rev 6, no REQ documents when `'unknown'` is produced. REQ-002 lines 75-77 enumerate three causes (frontmatter parse, VO conversion, block-parse), none of which produces `'unknown'`. PROP-019 requires every consumer to handle `'unknown'`, but no test fixture can produce it. Either the union is wrong or a REQ is missing.

**Recommended remediation**: either (1) add a REQ stating `'unknown'` is a defensive fallback for non-categorisable HydrateNote/parser errors, with example; or (2) remove `'unknown'` from `HydrationFailureReason` in `snapshots.ts` and `glossary.md §3` (type-contract migration).

---

## FIND-025 — PROP-027 `required:false` while sibling PROP-025 is `required:true` for an identical purity claim

- **Dimension**: spec_ambiguity
- **Severity**: major
- **Affects**: PROP-027, "required-true set" rationale at `verification-architecture.md` lines 191-198

**Quotes**: PROP-025 row (line 177) `required: true`; PROP-027 row (line 179) `required: false`. Both same Tier 1; both Pure-core purity.

**Issue**: Same kind of claim, same boundary criticality, asymmetric required flag. PROP-027 verifies that `HydrateNote` itself doesn't introduce a side effect (logger, default-clock, etc.); this is at least as load-bearing as `parseMarkdownToBlocks` purity because `HydrateNote` is the function the rest of the pipeline observes.

**Recommended remediation**: promote PROP-027 to `required: true`, OR add written justification for why `HydrateNote` purity is less load-bearing than `parseMarkdownToBlocks` purity.

---

## FIND-026 — Coverage Matrix REQ-008 row erroneously includes PROP-027

- **Dimension**: spec_ambiguity
- **Severity**: minor
- **Affects**: `verification-architecture.md` line 212

**Quote**: `REQ-008 | PROP-001, PROP-011, PROP-015, PROP-017, PROP-027`.

**Issue**: REQ-008's testable claim is `hydrateFeed` purity. The adversary asserts PROP-027 tests `HydrateNote` purity — a different function not called by `hydrateFeed` (per the adversary's reading). PROP-001 already covers the REQ-008 purity claim. Listing PROP-027 dilutes traceability.

NOTE: this finding is contingent on the resolution of FIND-022. If `hydrateFeed` does call `HydrateNote` per snapshot in Step 3, then PROP-027 IS relevant to REQ-008 and FIND-026 should be downgraded or marked as resolved-with-design-decision.

**Recommended remediation**: drop PROP-027 from the REQ-008 row; keep it under REQ-002 / REQ-017. OR document that `hydrateFeed` calls `HydrateNote` per snapshot (in which case keep PROP-027 in REQ-008).

---

## Routing recommendation

All 8 findings route back to Phase 1a/1b. FIND-020, FIND-021, FIND-022, and FIND-024 are blockers that prevent deterministic Red-phase test design and must be resolved before Phase 2a sprint-5 begins. After spec revision, re-enter Phase 1c iteration-6. Continue PROP/BEAD numbering from PROP-028+ / BEAD-084+ for any new artefacts; do not reuse retired identifiers.
