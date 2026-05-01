# Spec Revision — Iteration 1 Reflection Log

**Feature**: `apply-filter-or-search`
**Iteration**: 1
**Gate verdict before revision**: FAIL (2 critical, 8 major, 4 minor = 14 findings)
**Files revised**: `specs/behavioral-spec.md` (rev 1 → rev 2), `specs/verification-architecture.md` (rev 1 → rev 2)
**Date**: 2026-05-01

---

## Finding-by-Finding Resolution

### F-1c-001 (critical) — REQ-006 sortOrder passthrough had no behavioural PROP

**Fix applied**: Added PROP-013 (Tier 1): "For all valid `raw` inputs where `parseFilterInput` returns `Ok`, `result.value.sortOrder` deepEquals `raw.sortOrder` (both `field` and `direction` preserved, no override)." fast-check ≥200 runs, both directions. Updated REQ→PROP matrix: REQ-006 now maps to PROP-013 with "natural mis-implementation caught: ignoring raw.sortOrder; synthesizing default direction."

Updated REQ-006 acceptance criterion 4: "For all valid `raw` inputs, `parseFilterInput(raw).value.sortOrder` deepEquals `raw.sortOrder` (structural deep equality, not reference equality)."

### F-1c-002 (critical) — REQ-011 case-insensitive substring search had no semantic PROP

**Fix applied**: Added PROP-014 (Tier 1) with the exact predicate: `(snapshot.body + ' ' + snapshot.frontmatter.tags.join(' ')).toLowerCase().includes(query.text.toLowerCase())`. Requires ≥200 fast-check runs mixing case variants and regex metacharacters. Updated REQ-011 acceptance criteria to include the explicit predicate formula and explicitly state "Scope for frontmatter: tag name strings only (not timestamps). Per DD-2." Updated REQ→PROP matrix: REQ-011 now maps to PROP-014 with "natural mis-implementation caught: case-sensitive search; full-string equality; treating query as regex."

### F-1c-003 (major) — REQ-010 frontmatter field semantics had no dedicated PROP

**Fix applied**: Added PROP-015 (Tier 1) with three sub-claims: (a) case-sensitive exact match per field, (b) AND across map entries, (c) empty map no-op. REQ-010 acceptance criteria expanded: added multi-entry AND example (`{ status: "open", priority: "high" }` partial match fails) and explicit "case-sensitive" failure example. Updated REQ→PROP matrix: REQ-010 maps to PROP-015 with "natural mis-implementation caught: case-insensitive match; OR instead of AND; no-op for non-empty map."

### F-1c-004 (major) — REQ-014 no-filter/no-search was undertested (one-sided PROP)

**Fix applied**: Added PROP-018 (Tier 1) asserting the two-sided intersection: `result.ids` equals exactly `feed.noteRefs ∩ snapshots[*].noteId` (both subset AND superset). Test generates asymmetric pairs (noteRefs with no snapshot, snapshots with no noteRef). REQ-014 rewritten with explicit "no more, no less" language and two-sided acceptance criteria. PROP-008 retains the subset claim for REQ-007; PROP-018 owns the equality claim for REQ-014.

### F-1c-005 (major) — REQ-007 "noteRef without matching snapshot excluded" not asserted

**Fix applied**: PROP-008 upgraded to a **two-sided** claim: (a) every output id ∈ `feed.noteRefs`, AND (b) for every `id` in `result.ids`, there exists `s` in `snapshots` such that `s.noteId === id`. Test generation explicitly creates cases where some `noteRefs` deliberately lack matching snapshots. REQ-007 acceptance criteria now includes: "For every `id` in `result.ids`, there exists a snapshot `s` in `snapshots` such that `s.noteId === id`."

### F-1c-006 (major) — REQ-003 fail-fast not verified by any PROP

**Fix applied**: Added PROP-017 (Tier 1): "For any `raw` whose `tagsRaw` contains ≥1 invalid entry, `parseFilterInput(raw)` returns `Err` with `Err.raw` equal to the **first** invalid entry's raw string." fast-check ≥200 runs generating arrays with valid prefix + invalid suffix and vice versa. REQ-003 rewritten with explicit fail-fast language: "The function SHALL fail on the **first** invalid tag encountered (fail-fast left-to-right traversal)." Added two example acceptance criteria showing both orderings.

### F-1c-007 (major) — PROP-011 misclassified as Tier 0 but tested runtime invariant

**Fix applied**: Split PROP-011 into:
- **PROP-011a** (Tier 0): Code review confirming `parseFilterInput` calls `tryNewTag` from `value-objects.ts` and does NOT contain independent normalization logic. Description explicitly states "Does NOT cover runtime value invariants."
- **PROP-011b** (Tier 1): fast-check property asserting `Err.raw === raw.tagsRaw[i]` at runtime (the original pre-normalization string). ≥200 runs. Covers REQ-002 and REQ-003.

Tier Definitions section updated to explicitly state: "Tier 0 does NOT cover runtime value invariants."

### F-1c-008 (major) — REQ-012 NoteId tiebreak invented without source citation; asymmetric direction

**Fix applied**: Resolution (a) chosen per the findings instructions. Added **Design Decision DD-1** in a new "## Design Decisions" section at the top of behavioral-spec.md. DD-1 specifies that NoteId tiebreak direction mirrors the primary sort direction (asc → NoteId asc, desc → NoteId desc). REQ-012 EARS and acceptance criteria updated to reflect direction-consistent tiebreak. PROP-006 updated to specify the tiebreak direction for both desc and asc cases. Open question for future amendment of `aggregates.md` and `glossary.md` recorded in DD-1.

### F-1c-009 (major) — REQ-011 narrowed scope without justification

**Fix applied**: Added **Design Decision DD-2** in the same section as DD-1. DD-2 documents: "For MVP, frontmatter scope = `tags` only because timestamps are not natural search targets and no other text-typed frontmatter fields exist. Future text-typed fields require a spec amendment." REQ-011 body now cites DD-2 explicitly in the "Search scope" sub-clause. Open Question Q2 (previously about frontmatter search scope) removed from Open Questions section with a note "(previously labeled Q2 — resolved as DD-2)".

### F-1c-010 (major) — Tag-array dedup after normalization unspecified

**Fix applied**: Added normative dedup clause to **both** REQ-001 and REQ-002: "WHEN `tagsRaw` contains multiple raw strings whose `tryNewTag` outputs are equal `Tag` instances, `criteria.tags` SHALL contain that `Tag` exactly once, preserving first-occurrence order." Added two rows to the Edge Case Catalog: `["claude-code", "Claude-Code", "  claude-code  "]` → `[Tag("claude-code")]` and `["draft", "review", "Draft"]` → `[Tag("draft"), Tag("review")]`. Added **PROP-016** (Tier 1): fast-check property generating `tagsRaw` with known duplicates; assert `criteria.tags` has no structural duplicates and preserves first-occurrence order.

### F-1c-011 (minor) — REQ-005 `.trim()` on `query.text` contradicts ui-fields.md "直流し"

**Fix applied**: REQ-005 EARS and acceptance criteria revised. The whitespace-only collapse predicate (`searchTextRaw.trim() === ""`) is now explicitly stated as a detection mechanism only — it does NOT trim the resulting `query.text`. Acceptance criterion 5 changed from `"  middleware  "` → `query.text === "middleware"` (trimmed) to `"  middleware  "` → `query.text === "  middleware  "` (verbatim passthrough). Added explanatory note: "The predicate `searchTextRaw.trim() === ''` is used only to determine whether to produce `null`; it does NOT trim the resulting `query.text`."

Edge Case Catalog entry for `searchTextRaw: "  foo  "` updated from `query.text: "foo"` to `query.text: "  foo  "`.

### F-1c-012 (minor) — verification-architecture referenced vitest but package.json only has fast-check

**Fix applied**: Audited `promptnotes/package.json` — confirmed `fast-check ^4.7.0` present; no vitest entry. Confirmed `@types/bun ^1.3.13` present. Confirmed all existing test files use `import { describe, test, expect } from "bun:test"`. Verification-architecture.md Tooling section updated: "Test runner: `bun:test` — confirmed present via `@types/bun ^1.3.13`." The false claim "vitest ... already present in `promptnotes/package.json`" removed. Tier Definitions updated to reference `bun:test` + `fast-check`.

### F-1c-013 (minor) — REQ-016 cited Bun runtime but methodology unspecified

**Fix applied**: REQ-016 EARS updated: removed "wall clock, non-minified Bun runtime" (non-standard citation). Added pinned methodology: "1 warmup run (discarded), then median of 5 measurement runs using `performance.now()`, `bun:test` runtime, development machine." Explicitly labelled as a "soft regression bound, not a hard correctness invariant." CI advisory note added.

### F-1c-014 (minor) — Perf harness location under-specified

**Fix applied**: Designated a **dedicated file** `apply-filter-or-search.perf.test.ts` (separate from `apply-filter-or-search.test.ts`) with a labelled `describe("perf", ...)` block. Added to the harness layout diagram and harness layout section. Added a concrete methodology section with the exact protocol (1 warmup, 5 measurements, median, `performance.now()`, `bun:test`, development machine, soft bound) and an example code snippet.

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| F-1c-001 | critical | Resolved: PROP-013 added |
| F-1c-002 | critical | Resolved: PROP-014 added |
| F-1c-003 | major | Resolved: PROP-015 added |
| F-1c-004 | major | Resolved: PROP-018 added; REQ-014 two-sided |
| F-1c-005 | major | Resolved: PROP-008 upgraded to two-sided |
| F-1c-006 | major | Resolved: PROP-017 added; REQ-003 fail-fast explicit |
| F-1c-007 | major | Resolved: PROP-011 split into PROP-011a (Tier 0) + PROP-011b (Tier 1) |
| F-1c-008 | major | Resolved: DD-1 design decision; REQ-012 direction-consistent tiebreak; PROP-006 updated |
| F-1c-009 | major | Resolved: DD-2 design decision; REQ-011 cites DD-2; Q2 removed from Open Questions |
| F-1c-010 | major | Resolved: PROP-016 added; REQ-001/REQ-002 dedup clause; Edge Case Catalog rows added |
| F-1c-011 | minor | Resolved: REQ-005 verbatim passthrough; no trim on query.text |
| F-1c-012 | minor | Resolved: bun:test confirmed; vitest claim removed |
| F-1c-013 | minor | Resolved: REQ-016 methodology pinned |
| F-1c-014 | minor | Resolved: dedicated perf file + methodology documented |

**Total findings addressed: 14 / 14.**

**Deferred items**: None. All 14 findings from iteration-1 have been addressed in revision 2 of both spec files.

---

## PROP Inventory After Revision

| PROP | Tier | REQ Coverage |
|------|------|-------------|
| PROP-001 | 1 | REQ-015 |
| PROP-002 | 1 | REQ-015 |
| PROP-003 | 0 | REQ-015 |
| PROP-004 | 1 | REQ-008, REQ-004 |
| PROP-005 | 1 | REQ-009 |
| PROP-006 | 1 | REQ-012 |
| PROP-007 | 1 | REQ-012, REQ-015 |
| PROP-008 | 1 | REQ-007 (two-sided) |
| PROP-009 | 1 | REQ-013 |
| PROP-010 | 1 | REQ-005 |
| PROP-011a | 0 | REQ-002 |
| PROP-011b | 1 | REQ-002, REQ-003 |
| PROP-012 | 1 | REQ-012 |
| PROP-013 | 1 | REQ-006 (new) |
| PROP-014 | 1 | REQ-011 (new) |
| PROP-015 | 1 | REQ-010 (new) |
| PROP-016 | 1 | REQ-001, REQ-002 (new) |
| PROP-017 | 1 | REQ-003 (new) |
| PROP-018 | 1 | REQ-014 (new) |

**Total PROPs**: 19 (PROP-001 through PROP-018, with PROP-011 split into PROP-011a + PROP-011b = 19 entries).
