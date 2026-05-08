# Phase 1c Spec Review — Verdict (iteration-5, lean mode)

**Feature**: `app-startup`
**Reviewed artefacts**: `behavioral-spec.md` rev 6, `verification-architecture.md` rev 6
**Reviewer**: vcsdd-adversary (fresh context)
**Mode**: lean (no human-approval requirement; gate is binary PASS/FAIL on adversary verdict only)
**Timestamp**: 2026-05-08

## Per-dimension verdict

| Dimension | Verdict |
|-----------|---------|
| 1. EARS rigor | **PASS** |
| 2. Edge case coverage | **FAIL** |
| 3. Purity boundary correctness | **FAIL** |
| 4. Type-contract consistency | **FAIL** |
| 5. Traceability | **PASS** |
| 6. Spec ambiguity / hallucination | **FAIL** |

## Overall verdict

**FAIL**

The block-migration revision (rev 6) is internally inconsistent with the pinned type contracts and introduces three load-bearing ambiguities that block Phase 2a. Specifically:

1. The role of `HydrateNote` (whether it parses frontmatter, or only the body) directly contradicts `docs/domain/code/ts/src/curate/ports.ts` and `docs/domain/code/ts/src/shared/snapshots.ts`.
2. `ScannedVault.snapshots` after a block-migration `parseMarkdownToBlocks` step has no specified shape — REQ-002 keeps the type as `NoteFileSnapshot[]` (raw `Body` markdown) while REQ-008 calls it "fully-hydrated `Note` aggregates". One of these claims must be wrong; both cannot hold.
3. `parseMarkdownToBlocks` is asserted to be a Pure core function and is the target of `required: true` PROP-025, but `BlockId` allocation is left as "実装詳細（UUID v4 or block-<n>）" by `glossary.md §0`, leaving the purity claim unresolved. PROP-025 mitigates this with a `deepEqualsModuloBlockId` caveat, which is itself unspecified at Phase 1b.

In addition, the empty-`Block[]` return from `parseMarkdownToBlocks` (which contradicts Note Aggregate invariant 6: "blocks は最低 1 ブロックを保持") is not enumerated as an edge case; and PROP-027 (`HydrateNote` purity) is `required: false` despite being the same load-bearing claim that PROP-025 makes `required: true` for its sibling.

## Findings count

8 findings opened (FIND-019 through FIND-026):
- blocker: 3 (FIND-020, FIND-021, FIND-024)
- major: 4 (FIND-019, FIND-022, FIND-023, FIND-025)
- minor: 1 (FIND-026)

## Re-gate condition

Re-enter Phase 1c iteration-6 after `behavioral-spec.md` and `verification-architecture.md` are revised to resolve the routed findings. No PROP/BEAD identifier reuse — any new PROP/BEAD must continue from PROP-028+ / BEAD-084+.
