# Phase 1c Spec Review — apply-filter-or-search (iteration 2, lean)

## VERDICT: PASS

| Dimension | Verdict |
|-----------|---------|
| spec_fidelity | PASS |
| verification_readiness | PASS |

**Counts**: 0 critical, 0 major, 2 minor.

---

## Iteration-1 closure

All 14 prior findings (F-1c-001..F-1c-014) are substantively resolved by revision 2:

| Prior ID | Resolution |
|----------|-----------|
| F-1c-001 (REQ-006 sortOrder passthrough — critical) | PROP-013 (Tier 1, ≥200 fast-check, deepEquals on `sortOrder`). |
| F-1c-002 (REQ-011 substring + case-insensitive — critical) | PROP-014 (Tier 1, ≥200 runs, regex metacharacters as literals, scope check). |
| F-1c-003 (REQ-010 frontmatter field semantics) | PROP-015 (case-sensitive, AND across map, empty-map no-op). |
| F-1c-004 (REQ-014 exact intersection) | PROP-018 (two-sided exact intersection). |
| F-1c-005 (REQ-007 two-sided candidate set) | PROP-008 now two-sided. |
| F-1c-006 (REQ-003 fail-fast) | PROP-017 (Tier 1, ≥200 runs, mixed-validity prefix/suffix). |
| F-1c-007 (PROP-011 tier misclassification) | Split into PROP-011a (Tier 0) + PROP-011b (Tier 1 runtime). |
| F-1c-008 (REQ-012 NoteId tiebreak invented) | DD-1: direction-consistent tiebreak, rationale documented, upstream amendment pending. PROP-006 updated for both directions. |
| F-1c-009 (REQ-011 scope narrowing) | DD-2: scope = tags only for MVP. PROP-014 covers consequence. |
| F-1c-010 (Tag dedup unspecified) | Normative dedup clause in REQ-001/REQ-002, edge-case rows, PROP-016. |
| F-1c-011 (REQ-005 trim conflict) | REQ-005 → verbatim passthrough; whitespace-only collapse is detection-only. |
| F-1c-012 (vitest cited but absent) | Switched to `bun:test`; package.json verification confirmed `@types/bun ^1.3.13`. |
| F-1c-013 (perf runtime/harness mismatch) | Pinned `bun:test` + `performance.now()`, 1 warmup + median of 5, soft bound. |
| F-1c-014 (perf harness location) | Dedicated `apply-filter-or-search.perf.test.ts`, labelled `describe("perf", ...)`. |

---

## New findings (carry-forward to Phase 2a)

### F-1c-100 — PROP-004 wording: iff over empty set excludes all snapshots
- **severity**: minor
- **dimension**: verification_readiness
- **target**: PROP-004 vs REQ-008 acceptance #5
- **defect**: PROP-004 reads "snapshot included **iff** at least one `criteria.tags` element appears". When `criteria.tags = []`, the iff vacuously excludes all snapshots, contradicting REQ-008 #5 ("empty criteria.tags = no-op filter").
- **suggested_fix**: Tighten PROP-004 to "When `criteria.tags` is non-empty, snapshot ∈ ids iff at least one element matches; when empty, no-op." Add fast-check arbitrary covering both branches.

### F-1c-101 — PROP-011a cites non-existent `tryNewTag` free function in value-objects.ts
- **severity**: minor
- **dimension**: verification_readiness
- **target**: PROP-011a, Findings to Carry Forward §4, REQ-002
- **defect**: `value-objects.ts` exports only the `TagSmartCtor` interface (no concrete `tryNewTag` free function). Production normalization runs Rust-side via Tauri. PROP-011a as worded is unverifiable in Phase 5 because the cited symbol does not exist.
- **suggested_fix**: Either (a) defer concrete TS-side `tryNewTag` symbol to Phase 2a, or (b) add a Phase 2a deliverable providing a pure TS `tryNewTag` co-located with Curate domain. Update PROP-011a to cite the resolved module path.

Both findings are recoverable wording/citation issues — neither blocks Phase 2a. Carried forward for resolution at the start of test generation.

---

## Final verdict

**verdict=PASS, dimensions={spec_fidelity:PASS, verification_readiness:PASS}, findings={critical:0, major:0, minor:2}**

Lean threshold (≤2 majors, 0 criticals) comfortably satisfied.
