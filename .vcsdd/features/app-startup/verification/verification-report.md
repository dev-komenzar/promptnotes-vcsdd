# Phase 5 Verification Report — app-startup

**Feature**: app-startup
**Phase**: 5 (Formal Hardening)
**Sprint**: 5 iteration 2
**Mode**: lean
**Language**: TypeScript
**Spec revision**: 8 (verification-architecture.md rev8)
**Verified at**: 2026-05-08T00:00:00Z

---

## Proof Obligations

| ID | Tier | Required | Status | Tool | Harness | Result log |
|----|------|----------|--------|------|---------|------------|
| PROP-001 | 1 | true | proved | fast-check (numRuns=1000) | proof-harnesses/prop-001-hydrate-feed-purity.harness.ts | fuzz-results/prop-001.log |
| PROP-002 | 1 | true | proved | fast-check (numRuns=1000) | proof-harnesses/prop-002-hydrate-feed-excludes-corrupted.harness.ts | fuzz-results/prop-002.log |
| PROP-003 | 1 | true | proved | fast-check (numRuns=1000) | proof-harnesses/prop-003-next-available-note-id.harness.ts | fuzz-results/prop-003.log |
| PROP-004 | 0 | true | proved | TypeScript type exhaustiveness | proof-harnesses/prop-004-app-startup-error-exhaustive.harness.ts | fuzz-results/prop-004.log |
| PROP-023 | 1 | true | proved | fast-check + spy (numRuns=100) | proof-harnesses/prop-023-clock-budget.harness.ts | fuzz-results/prop-023.log |
| PROP-025 | 1 | true | proved | fast-check (numRuns=100) | proof-harnesses/sprint-5/prop-025-parse-markdown-to-blocks-purity.harness.ts | fuzz-results/sprint-5/prop-025.log |
| PROP-026 | 2 | true | proved | example-based test with stub | proof-harnesses/sprint-5/prop-026-block-parse-failure-mapping.harness.ts | fuzz-results/sprint-5/prop-026.log |
| PROP-027 | 1 | true | proved | fast-check (numRuns=100) | proof-harnesses/sprint-5/prop-027-hydrate-note-purity.harness.ts | fuzz-results/sprint-5/prop-027.log |
| PROP-029 | 2 | true | proved | example-based test with stub + real parser | proof-harnesses/sprint-5/prop-029-ok-empty-block-parse.harness.ts | fuzz-results/sprint-5/prop-029.log |
| PROP-031 | 2 | true | proved | example-based + fast-check (numRuns=200) | proof-harnesses/sprint-5/prop-031-parser-no-empty-paragraph.harness.ts | fuzz-results/sprint-5/prop-031.log |
| PROP-032 | 2 | true | proved | example-based test with divergent stub | proof-harnesses/sprint-5/prop-032-hydrate-feed-throws-on-err.harness.ts | fuzz-results/sprint-5/prop-032.log |

---

## Harness Strategy

Sprint-4 ハーネス (PROP-001/002/003/004/023) は `promptnotes/src/lib/domain/__tests__/app-startup/__verify__/` 配下に `*.harness.test.ts` として配置し `bun test` で実行する。

Sprint-5 新規証明義務 (PROP-025/026/027/029/031/032) の実行可能証明は以下のテストファイルに直接組み込まれた:

| PROP | 実行可能テストファイル |
|------|----------------------|
| PROP-025 | `__tests__/app-startup/parse-markdown-to-blocks-purity.test.ts` |
| PROP-026 | `__tests__/app-startup/step2-block-parse.test.ts` |
| PROP-027 | `__tests__/app-startup/hydrate-note-purity.test.ts` |
| PROP-029 | `__tests__/app-startup/step2-block-parse.test.ts` |
| PROP-031 | `__tests__/app-startup/parse-markdown-to-blocks-blank-lines.test.ts` |
| PROP-032 | `__tests__/app-startup/step3-hydrate-feed.test.ts` |

`.vcsdd/.../verification/proof-harnesses/sprint-5/` には同一義務のメタデータ・証明根拠参照ファイルを配置する。

---

## Results

### PROP-001: hydrateFeed purity (re-verified sprint 5)

- **Tier**: 1
- **Tool**: fast-check v4.7.0 (numRuns=1000)
- **Test file**: `__tests__/app-startup/__verify__/prop-001-hydrate-feed-purity.harness.test.ts`
- **Result**: VERIFIED
- **Output**: 3 pass / 0 fail
- **Property checked**: `∀ (snapshots[0..8], corruptedFiles[0..4]), hydrateFeed(input) deepEquals hydrateFeed(input)`
  - noteRefs, tagInventory, corruptedFiles, lastBuiltAt 全フィールド一致
  - Date.now スパイ: 0 calls (purity 確認済み)
  - hydrateFeed.length === 1

### PROP-002: hydrateFeed excludes corrupted (re-verified sprint 5)

- **Tier**: 1
- **Tool**: fast-check v4.7.0 (numRuns=1000)
- **Test file**: `__tests__/app-startup/__verify__/prop-002-hydrate-feed-excludes-corrupted.harness.test.ts`
- **Result**: VERIFIED
- **Output**: 4 pass / 0 fail
- **Property checked**: `∀ (snapshots[0..8], corruptedFiles[0..4]), noteRefs ⊆ inputSnapshotNoteIds`

### PROP-003: nextAvailableNoteId uniqueness (re-verified sprint 5)

- **Tier**: 1
- **Tool**: fast-check v4.7.0 (numRuns=1000)
- **Test file**: `__tests__/app-startup/__verify__/prop-003-next-available-note-id.harness.test.ts`
- **Result**: VERIFIED
- **Output**: 5 pass / 0 fail
- **Property checked**: `∀ ts, ∀ existingIds, nextAvailableNoteId(ts, existingIds) ∉ existingIds`

### PROP-004: AppStartupError exhaustiveness (re-verified sprint 5)

- **Tier**: 0 (TypeScript type-level)
- **Tool**: TypeScript type exhaustiveness (never branch in switch)
- **Test file**: `__tests__/app-startup/__verify__/prop-004-app-startup-error-exhaustive.harness.test.ts`
- **Result**: VERIFIED
- **Output**: 5 pass / 0 fail

### PROP-023: Clock.now call budget (re-verified sprint 5)

- **Tier**: 1
- **Tool**: fast-check asyncProperty + spy (numRuns=100)
- **Test file**: `__tests__/app-startup/__verify__/prop-023-clock-budget.harness.test.ts`
- **Result**: VERIFIED
- **Output**: 5 pass / 0 fail
- **Property checked**: `∀ epoch_ms, clockCallCount ∈ [1, 2]`

### PROP-025: parseMarkdownToBlocks purity (NEW — sprint 5)

- **Tier**: 1
- **Tool**: fast-check (numRuns=100) + concrete examples
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/parse-markdown-to-blocks-purity.test.ts`
- **Result**: VERIFIED
- **Output**: 8 pass / 0 fail
- **Property checked**: `∀ markdown, parseMarkdownToBlocks(markdown) deepEquals parseMarkdownToBlocks(markdown)` including BlockId values (positional `block-0..block-N-1`)
- **Key checks**:
  - Positional BlockId scheme verified (block-N, zero-indexed, resets per call)
  - No UUID v4 format in BlockIds (BlockIdSmartCtor.generate() not invoked)
  - Interleaved calls do not contaminate BlockId sequences
  - Empty string → Ok([]) (PROP-031 intersection verified)

### PROP-026: block-parse failure mapping (NEW — sprint 5)

- **Tier**: 2
- **Tool**: Example-based tests with parseMarkdownToBlocks stub
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/step2-block-parse.test.ts`
- **Result**: VERIFIED
- **Output**: 12 pass / 0 fail (5 PROP-026 specific)
- **Property checked**: Both `unterminated-code-fence` and `malformed-structure` BlockParseError variants → `failure:{kind:'hydrate',reason:'block-parse'}`. Not `'unknown'`, not `'yaml-parse'`. Workflow continues after per-file failure.

### PROP-027: HydrateNote ACL purity (NEW — sprint 5)

- **Tier**: 1
- **Tool**: fast-check (numRuns=100) + concrete examples
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/hydrate-note-purity.test.ts`
- **Result**: VERIFIED
- **Output**: 13 pass / 0 fail
- **Properties checked**:
  - `∀ snapshot, hydrateNote(snapshot) deepEquals hydrateNote(snapshot)` including Block.id values
  - `hydrateNote.length === 1` (unary)
  - `Date.now` call count = 0 during hydrateNote execution
  - Err(BlockParseError) body → always `Err('block-parse')` (deterministic)
  - Ok([]) body → always `Err('block-parse')` (invariant 6 preserved)
  - Rev8 pass-through: no block filtering, no BlockId reassignment
  - FrontmatterParser.parse NOT called (frontmatter already VO on snapshot)

### PROP-029: Ok([]) → block-parse classification (NEW — sprint 5)

- **Tier**: 2
- **Tool**: Example-based tests with stub and real parser
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/step2-block-parse.test.ts`
- **Result**: VERIFIED
- **Output**: 12 pass / 0 fail (5 PROP-029 specific)
- **Properties checked**:
  - Stub returning Ok([]) → `failure.reason === 'block-parse'` (not 'invalid-value')
  - Ok([]) not silently dropped: total invariant (snapshots + corrupted = files) preserved
  - Ok([]) not auto-padded: snapshots.length === 0
  - Real parser + whitespace-only body (`'\n\n\n'`, `'   '`) → real Ok([]) → block-parse (Q5=A end-to-end)

### PROP-031: parser blank-line coalesce contract (NEW — sprint 5)

- **Tier**: 2 + Tier 1 (fast-check property)
- **Tool**: Example-based (9 concrete + 8 parametric) + fast-check (numRuns=200)
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/parse-markdown-to-blocks-blank-lines.test.ts`
- **Result**: VERIFIED
- **Output**: 18 pass / 0 fail
- **Properties checked**:
  - `'a\n\n\nb'` → Ok([paragraph('a'), paragraph('b')]) with no empty paragraph
  - All whitespace-only inputs (8 variants) → Ok([])
  - fast-check property: `∀ markdown, no paragraph('') in parseMarkdownToBlocks(markdown).value` (200 runs)
  - Heading + blank lines + paragraph → [heading, paragraph], no artifacts

### PROP-032: hydrateFeed throws on hydrateNote Err (NEW — sprint 5)

- **Tier**: 2
- **Tool**: Example-based tests with divergent parseMarkdownToBlocks stub
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/step3-hydrate-feed.test.ts`
- **Result**: VERIFIED
- **Output**: 22 pass / 0 fail (5 PROP-032 specific)
- **Properties checked**:
  - `hydrateFeed(input)` throws `Error` matching `/^hydrateNote-invariant-violation: .+: .+$/`
  - Thrown message contains `snapshot.filePath` and `reason`
  - `corruptedFiles[]` does NOT gain Step-3 entries (throw aborts before any routing)
  - Happy path (all Ok): does NOT throw
  - Partial failure (1 of N diverges): throws immediately

---

## Degradation Notes

No degradation occurred. All obligations were verified at their declared tier:
- PROP-001/002/003/023/025/027: Tier 1 (fast-check property tests) — no degradation
- PROP-004: Tier 0 (TypeScript type exhaustiveness) — no degradation
- PROP-026/029/031/032: Tier 2 (example-based) with PROP-031 additionally covered by Tier 1 fast-check

---

## Full Test Suite Regression

- `bun test` (全テスト): **1943 pass / 0 fail** (4 skip, 4 todo — pre-existing)
- Test files: 157
- expect() calls: 27977
- `bun test src/lib/domain/__tests__/app-startup/`: 212 pass / 0 fail (17 files)
- `bun test src/lib/domain/__tests__/app-startup/__verify__/`: 22 pass / 0 fail (5 files, sprint-4 harnesses)

---

## Summary

- **Required obligations**: 11
- **Proved**: 11 (PROP-001, PROP-002, PROP-003, PROP-004, PROP-023, PROP-025, PROP-026, PROP-027, PROP-029, PROP-031, PROP-032)
- **Failed**: 0
- **Skipped**: 0

全 11 件の required proof obligation が proved 状態に達した。
Phase 6 収束判定の前提条件 (all required obligations proved) を満たす。

**Sprint 5 iteration 2 新規証明 (6件)**:
- PROP-025: parseMarkdownToBlocks purity — pure-core purity claim confirmed. Positional BlockId scheme (`block-N`) is deterministic; no UUID allocation.
- PROP-026: block-parse failure mapping — both BlockParseError variants fold to `reason='block-parse'`; workflow continues.
- PROP-027: HydrateNote ACL purity — referentially transparent; no I/O, no clock. Rev8 pass-through (no filter, no BlockId reassignment) verified.
- PROP-029: Ok([]) → block-parse — whitespace-only body path verified end-to-end with real parser (Q5=A integration).
- PROP-031: parser blank-line coalesce — 18 tests + 200 fast-check runs confirm no `paragraph('')` artifacts.
- PROP-032: hydrateFeed fail-fast throw — invariant-violation throw confirmed; corruptedFiles not augmented by Step-3 failures.

**残留リスク**:
- PROP-028 (required: false): `'unknown'` fallback path test exists (`step2-hydration-unknown-fallback.test.ts`) but is optional per spec rev8. Not evaluated as required.
- PROP-030 (required: false): two-call invariant (`parse-call-budget.test.ts`). Optional per spec rev8.
- mutation testing (Stryker): lean モードで任意のためスキップ。fast-check property tests がカバレッジを提供。
