# Phase 1c Spec Review — apply-filter-or-search (iteration 1, lean)

**VERDICT: FAIL**

| Dimension | Verdict |
|-----------|---------|
| spec_fidelity | FAIL |
| verification_readiness | FAIL |

**Counts**: 2 critical, 8 major, 4 minor.

---

## F-1c-001 — REQ-006 sortOrder passthrough has no behavioural property coverage
- **severity**: critical
- **dimension**: verification_readiness
- **target**: REQ-006 / PROP-001
- **defect**: REQ-006 (sortOrder passthrough) maps solely to PROP-001 (parseFilterInput determinism). A buggy implementation that ignores `raw.sortOrder` and always returns `{ field: "timestamp", direction: "desc" }` still satisfies determinism. No PROP asserts `parseFilterInput(raw).value.sortOrder` deepEquals `raw.sortOrder`.
- **suggested_fix**: Add Tier-1 PROP: "For valid `raw`, `parseFilterInput(raw).value.sortOrder` deepEquals `raw.sortOrder`." Update REQ→PROP matrix.

## F-1c-002 — REQ-011 case-insensitive substring search has no property covering its semantics
- **severity**: critical
- **dimension**: verification_readiness
- **target**: REQ-011 / PROP-004 / PROP-005
- **defect**: REQ-011 specifies (a) literal substring (no regex), (b) case-insensitive, (c) scope = body + frontmatter tag names. Mapped PROPs cover tag OR semantics and AND composition. Neither tests substring matching, case insensitivity, or scope. Case-sensitive full-string equality on body only would pass both PROPs.
- **suggested_fix**: Add Tier-1 PROP: "When `applied.query` is non-null, snapshot ∈ result.ids iff `query.text.toLowerCase()` is substring of `(snapshot.body + ' ' + snapshot.frontmatter.tags.join(' ')).toLowerCase()` (and other criteria pass)." ≥200 fast-check runs mixing case + regex metacharacters.

## F-1c-003 — REQ-010 case-sensitive frontmatter field exact match has no dedicated property
- **severity**: major
- **dimension**: verification_readiness
- **target**: REQ-010 / PROP-005
- **defect**: REQ-010 demands case-sensitive exact match per `(field, value)`, AND across map entries, plus empty-map no-op. PROP-005 ("only snapshots meeting all three appear") does not exercise case sensitivity, AND-within-map, or the empty-map branch.
- **suggested_fix**: Add a dedicated PROP for frontmatter field semantics, or rewrite PROP-005 to enumerate the three sub-claims.

## F-1c-004 — REQ-014 (no-filter no-search) is undertested by cited PROPs
- **severity**: major
- **dimension**: verification_readiness
- **target**: REQ-014 / PROP-008 / PROP-009
- **defect**: REQ-014 acceptance #1: result `ids` is exactly `feed.noteRefs ∩ snapshots[*].noteId` when no criteria are active. PROP-008 is a one-way subset claim. PROP-009 only constrains the flag. Empty `ids` would pass both PROPs.
- **suggested_fix**: Strengthen PROP-008 to two-sided, or add PROP: "When no criteria active, `result.ids` exactly equals `feed.noteRefs ∩ snapshots[*].noteId`."

## F-1c-005 — REQ-007 acceptance "noteRef without matching snapshot is excluded" is not asserted
- **severity**: major
- **dimension**: verification_readiness
- **target**: REQ-007 / PROP-008
- **defect**: REQ-007 has two symmetric criteria; PROP-008 asserts only one direction. Implementation emitting noteRefs raw without snapshot resolution would pass.
- **suggested_fix**: Extend PROP-008: for every `id` in `result.ids`, `snapshots.some(s => s.noteId === id)` must hold. Generate cases where some `noteRefs` deliberately lack matching snapshots.

## F-1c-006 — REQ-003 fail-fast invariant is unverified
- **severity**: major
- **dimension**: verification_readiness
- **target**: REQ-003 / PROP-010 / PROP-011
- **defect**: REQ-003 acceptance #4: fail-fast on first invalid tag in mixed-validity array. Cited PROPs cover empty/whitespace and `raw` field preservation. Cross-array fail-fast is not asserted.
- **suggested_fix**: Add Tier-1 PROP: "For any `raw` whose `tagsRaw` contains ≥1 invalid entry, `parseFilterInput(raw)` returns `Err` with `Err.raw === offending`." Add a deterministic example test for ordering.

## F-1c-007 — PROP-011 is misclassified as Tier 0 but tests a runtime invariant
- **severity**: major
- **dimension**: verification_readiness
- **target**: PROP-011
- **defect**: PROP-011 (Tier 0) claims TS type-check verifies `Err.raw` equals input. TypeScript cannot verify runtime values. PROP also conflates this with a true Tier-0 review claim ("no parallel normalization logic").
- **suggested_fix**: Split into PROP-011a (Tier 0, code review confirming `tryNewTag` reuse) and PROP-011b (Tier 1, fast-check on `Err.raw === raw.tagsRaw[i]`).

## F-1c-008 — REQ-012 NoteId-lexicographic tiebreak is invented without source citation
- **severity**: major
- **dimension**: spec_fidelity
- **target**: REQ-012
- **defect**: REQ-012 mandates NoteId-lexicographic-ascending tiebreak. Source docs say only "timestamp desc/asc" — none mention any tiebreak. Spec pins ascending NoteId regardless of `direction`; under desc this prefers older note, contradicting primary key direction.
- **suggested_fix**: Either (a) document tiebreak as design decision and add to aggregates.md / glossary, or (b) flip tiebreak with `direction`. Pick one and update REQ-012 + PROP-006.

## F-1c-009 — REQ-011 silently narrows `scope: "body+frontmatter"` to body + tag names only
- **severity**: major
- **dimension**: spec_fidelity
- **target**: REQ-011
- **defect**: aggregates.ts `SearchScope = "body+frontmatter" | "body" | "frontmatter"`; glossary.md / ui-fields.md fix the scope. REQ-011 acceptance #6 narrows to tag-name strings without justification.
- **suggested_fix**: Either widen REQ-011, or restate the narrowing as "Design decision: frontmatter scope = `tags` only because timestamps are not natural search targets. Future text-typed fields require spec amendment." Fold Open Question #2 into REQ-011.

## F-1c-010 — Tag-array deduplication after normalization is unspecified
- **severity**: major
- **dimension**: spec_fidelity
- **target**: REQ-001 / REQ-002 / REQ-004
- **defect**: `tagsRaw: readonly string[]` permits inputs like `["claude-code", "Claude-Code", "  claude-code  "]` which all normalize to the same `Tag`. Spec is silent on dedup.
- **suggested_fix**: Add normative clause: "WHEN `tagsRaw` contains multiple raw strings whose `tryNewTag` outputs are equal, `criteria.tags` SHALL contain that `Tag` exactly once" — or pick passthrough explicitly. Add edge case row.

## F-1c-011 — REQ-005 introduces `searchTextRaw.trim()` semantics not in source docs
- **severity**: minor
- **dimension**: spec_fidelity
- **target**: REQ-005
- **defect**: REQ-005 acceptance #5: `"  middleware  "` → `query.text === "middleware"`. ui-fields.md §1D explicitly says "MVP は部分一致前提で `searchTextRaw: string` を `SearchQuery.text: string` に直流し" (direct passthrough).
- **suggested_fix**: Either drop `.trim()` to match ui-fields.md, or update REQ-005 source citation acknowledging the amendment.

## F-1c-012 — verification-architecture references vitest but package.json only declares fast-check
- **severity**: minor
- **dimension**: verification_readiness
- **target**: §"Test Harness Layout" / Tooling
- **defect**: Doc says vitest "already present in `promptnotes/package.json`". Inspection shows `fast-check ^4.7.0` only — no vitest entry.
- **suggested_fix**: Audit actual provisioning and update doc to cite real mechanism, or treat vitest as Phase 2a addition.

## F-1c-013 — REQ-016 cites Bun runtime; verification harness uses vitest
- **severity**: minor
- **dimension**: spec_fidelity
- **target**: REQ-016
- **defect**: REQ-016 measures < 50 ms "wall clock, non-minified Bun runtime"; harness runs in vitest. Methodology unspecified.
- **suggested_fix**: Match runtime to harness, or move benchmark to dedicated `bun:test` harness. Pin warmup + measurement protocol (e.g., median of 5 after 1 warmup).

## F-1c-014 — REQ-016 perf bound's harness location is under-specified
- **severity**: minor
- **dimension**: verification_readiness
- **target**: REQ-016
- **defect**: Matrix says perf is "example-based in `apply-filter-or-search.test.ts`" but harness layout doesn't separate perf case from unit cases nor document methodology.
- **suggested_fix**: Either dedicate `apply-filter-or-search.bench.test.ts`, or call out the perf block (labelled `describe`). Pin methodology threshold.
