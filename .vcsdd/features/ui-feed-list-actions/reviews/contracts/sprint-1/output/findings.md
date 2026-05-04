# Sprint Contract Review — Findings

Feature: `ui-feed-list-actions` Sprint 1
Reviewer: vcsdd-adversary (fresh context, strict mode, iter-1)
Date: 2026-05-04

Overall: **FAIL** (high=2, medium=4, low=2). PASS threshold (high=0, medium ≤ 2) breached.

---

## High Severity (2)

### FIND-CONTRACT-01 — CRIT-002 universal quantifier vs partial coverage
- Severity: **high**
- Dimensions: edge_case_coverage, wording 曖昧さ
- Targets: CRIT-002
- Evidence: `contracts/sprint-1.md:14-17`. Description claims "EC-FEED-001..EC-FEED-015 from spec are tested" but passThreshold lists only 6/14 ECs (001/003/004/005/014/015). EC-FEED-002, 006, 007, 008, 009, 011, 012, 013 are not named.
- Problem: `all` quantifier is unverifiable. Adversary cannot re-evaluate per-EC pass.
- Recommended fix: name each EC-FEED-NNN with testfile + describe block name, e.g.:
  > EC-FEED-007/008/009: `DeletionFailureBanner.dom.vitest.ts` describe `"reason: permission|lock|unknown"` 各 pass

### FIND-CONTRACT-02 — CRIT-005 vitest count is repo-wide, not feed-scoped
- Severity: **high**
- Dimensions: passThreshold 検証可能性
- Targets: CRIT-005
- Evidence: `contracts/sprint-1.md:30-32`. `vitest 174 tests pass across 23 files` is repo-wide (per `evidence/sprint-1-green-phase.log:11-12`); only 4 of those 23 files belong to feed/. CRIT-005 (weight 0.10) for the rendered Svelte component tree must be feed-scoped. Also no specific PROP-FEED-013..025/029 DOM properties are named.
- Recommended fix: replace with `vitest --reporter=verbose run promptnotes/src/lib/feed/__tests__/dom/ → 4 files, 0 failures`, name key DOM assertions per PROP-FEED.

---

## Medium Severity (4)

### FIND-CONTRACT-03 — CRIT-001 grep-only REQ check is test_quality smell
- Severity: medium
- Dimensions: scope 充足性, passThreshold 検証可能性
- Targets: CRIT-001
- Evidence: `contracts/sprint-1.md:10-12`. `Every REQ-FEED-XXX ID appears in at least one test file` is grep-only — comments containing `REQ coverage: REQ-FEED-005..018` (e.g., `feedReducer.test.ts:14`) trivially satisfy this without semantic verification. Also REQ-FEED-004 / REQ-FEED-016 are grep-only audits (color tokens, focus ring) and don't fit the `feedReducer.test.ts / feedRowPredicates.test.ts / DOM vitest` triad named.
- Recommended fix: per-REQ thresholds citing PROP-FEED-NNN test names from verification-architecture.md §6.

### FIND-CONTRACT-04 — Dimension distribution gaps
- Severity: medium
- Dimensions: CRIT のディメンション分布
- Targets: 全 CRIT
- Evidence: `contracts/sprint-1.md:7-32`. 5 CRIT span 3 dimensions (`spec_fidelity` ×2, `edge_case_coverage` ×1, `implementation_correctness` ×2). NFR-FEED-005 purity (PROP-FEED-030/031/032) is folded into `implementation_correctness` rather than a dedicated `purity_compliance`. NFR-FEED-001/002 a11y has no CRIT (PROP-FEED-025/029 unnamed). NFR-FEED-003 DESIGN.md token (PROP-FEED-027/028) unnamed.
- Recommended fix: split into 8〜10 CRIT with `purity_compliance` and `quality_attributes` (a11y / token) as independent dimensions.

### FIND-CONTRACT-05 — Bare basenames hide bun:test vs vitest split
- Severity: medium
- Dimensions: passThreshold 検証可能性
- Targets: CRIT-001/002/005
- Evidence: `contracts/sprint-1.md:10-32`. All thresholds use bare basename without workspace path or runner. `feedReducer.test.ts` runs in **bun:test** but `FeedList.dom.vitest.ts` runs in **vitest** (per `vitest.config.ts:22` include glob `src/lib/**/__tests__/dom/**/*.vitest.ts`). The two-runner split is not encoded.
- Recommended fix: `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts (bun:test)` 形式に統一。

### FIND-CONTRACT-06 — CRIT-003 has duplicated and fragile thresholds
- Severity: medium
- Dimensions: passThreshold 検証可能性
- Targets: CRIT-003
- Evidence: `contracts/sprint-1.md:20-22`. `grep for new Date/Date( in pure modules returns 0 hits` is already subsumed by PROP-FEED-031 canonical pattern (per `purityAudit.test.ts:84-85`). Also `purityAudit.test.ts 4/4` and `ipcBoundary.test.ts 3/3` test counts are reverse-engineered without contractual basis — fragile to test expansions.
- Recommended fix: remove duplicate grep; name each test by describe/test title.

---

## Low Severity (2)

### FIND-CONTRACT-07 — CRIT-004 numRuns binding to specific properties
- Severity: low
- Dimensions: wording 曖昧さ
- Targets: CRIT-004
- Evidence: `contracts/sprint-1.md:25-27`. `feedReducer.test.ts all assertions pass including fast-check properties with numRuns≥200` — `all` denominator is undefined (file actually has ~30 tests). Six fast-check properties (PROP-FEED-005/006/007a/007b/007c/007d) are named in description but threshold doesn't bind numRuns≥200 to specific property names. Only PROP-FEED-035g gets the more specific `numRuns≥300`.
- Recommended fix: per-property `(test name) numRuns ≥ 200` (ui-editor sprint-1.md スタイル踏襲).

### FIND-CONTRACT-08 — clockHelpers.ts undocumented in verification-architecture
- Severity: low
- Dimensions: scope 充足性
- Targets: scope frontmatter
- Evidence: `contracts/sprint-1.md:4`. scope mentions `clockHelpers.ts` which is **not present** in `verification-architecture.md §2 Effectful Shell Modules` (L48-55 lists only `feedStateChannel.ts` / `tauriFeedAdapter.ts`). Also `all PROP-FEED proof obligations` is universal but PROP-FEED-013/015..029 are not named in any CRIT.
- Recommended fix: add `clockHelpers.ts` to verification-architecture.md §2 with purity audit obligation; narrow scope quantifier to `Required: true PROP-FEED only` if not naming all 35.
