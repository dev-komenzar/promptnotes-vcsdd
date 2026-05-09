# Phase 3 Adversarial Review — Iteration 2 (re-review)

**Reviewer**: vcsdd-adversary (fresh context, strict mode, session phase-3-strict-2)
**Reviewed**: 2026-05-09
**Verdict**: **PASS** — 0 CRITICAL + 0 MAJOR remaining; 3 MINOR carry-over justified

## Dimension verdicts (iter 2)

| Dimension | Iter 1 | Iter 2 |
|-----------|--------|--------|
| req_prop_test_traceability | PASS | PASS |
| prop_test_coverage | PASS | PASS |
| spec_adherence | **FAIL** | **PASS** |
| nfr_adherence | **FAIL** | **PASS** |
| test_quality | **FAIL** | **PASS** |
| adapter_contract | PASS | PASS |
| edge_case_implementation | **FAIL** | **PASS** |

---

## Prior finding disposition

### FIND-BE-3-001 (CRITICAL) — RESOLVED
control-char strip テストが textContent に実 U+0001 / U+007F / `\n` を入れて strip 動作を観測する形に書き直された。`sanitiseContent` が恒等関数になれば 6 件全部が落ちる構造。
**Evidence**: `block-element.dom.vitest.ts:518-570`、`BlockElement.svelte:122-143`

### FIND-BE-3-002 (CRITICAL) — RESOLVED
Enter mid-block split 分岐の DOM テストを追加。`Range.setStart(textNode, 3)` で caret を置き、`dispatchSplitBlock({offset: 3, ...})` を exact-match で検証、`dispatchInsertBlockAfter` 非呼出と `event.defaultPrevented` も併せて assertions。
**Evidence**: `block-element.dom.vitest.ts:302-328`、`BlockElement.svelte:193-216`

### FIND-BE-3-003 (MAJOR) — RESOLVED
SlashMenu open + Enter テストに positive assertion を追加。`dispatchChangeBlockType` が paragraph type で 1 回呼ばれることを検証。
**Evidence**: `block-element.dom.vitest.ts:331-354`、`behavioral-spec.md:328`

### FIND-BE-3-004 (MAJOR) — RESOLVED
EC-BE-002 / EC-BE-003 を 2 件の DOM テストでカバー。`/heading` 入力時のフィルタと、`/` 削除時の menu close。
**Evidence**: `block-element.dom.vitest.ts:463-489`、`BlockElement.svelte:172-179`

### FIND-BE-3-005 (MAJOR) — RESOLVED
PROP-BE-044 grep を全 directory に拡大。4 .svelte の docstring 内 REQ-EDIT/PROP-EDIT/EC-EDIT/NFR-EDIT を REQ-BE/PROP-BE 命名へ書き換え済み。
**Evidence**: `sprint-4.gates.test.ts:138-148`、4 svelte ファイル冒頭

### FIND-BE-3-006 (MAJOR) — RESOLVED
click → dispatchFocusBlock テストを `toHaveBeenCalledTimes(1)` + 完全 payload 検証へ強化。
**Evidence**: `block-element.dom.vitest.ts:198-208`

### FIND-BE-3-007 (MAJOR) — RESOLVED
`SaveFailureBanner` から未使用 props (`priorFocusedBlockId`, `noteId`, `issuedAt`) を除去。surface = error + 3 callback で REQ-BE-015/016 と整合。
**Evidence**: `SaveFailureBanner.svelte:15-27`、`save-failure-banner.dom.vitest.ts:43-55`

### FIND-BE-3-008 (MAJOR) — RESOLVED
classifyMarkdownPrefix property test を全 8 prefix にループ化。`trimmedContent === suffix` も全 prefix で検証。
**Evidence**: `prop/blockPredicates.prop.test.ts:131-156`

### FIND-BE-3-009 (MINOR) — UNRESOLVED, carry-over 妥当
`splitOrInsert` の in-block / fallback 区別。REQ-BE-018 で `splitOrInsert(10, 5) === 'split'` を fallback として明記済み、property は spec の単純規則を完全カバー。Phase 2c での docstring 改善は optional。

### FIND-BE-3-010 (MINOR) — UNRESOLVED, carry-over 妥当
`getCaretOffset` の jsdom fallback. split 分岐テスト（FIND-002 の追加）が実 Selection 経路を一部カバー。完全な Tier 1 helper 抽出は Phase 2c hardening。

### FIND-BE-3-011 (MINOR) — PARTIAL
`SaveFailureBanner` の `_` prefix は除去（FIND-007 で消滅）。`BlockDragHandle.svelte:36` の `onMoveBlock: _onMoveBlock` は REQ-BE-14b で optional 化と documented intentional unused。残りは eslint rule で hardening 可能（optional）。

### FIND-BE-3-012 (MINOR) — RESOLVED
`keyboardListener` / `clipboardAdapter` の dead-code import gate を 2 件追加。`from|import|require` を伴う行のみ violations と判定し、`__tests__` を除外。
**Evidence**: `sprint-4.gates.test.ts:160-204`、`keyboardListener.ts:1-13`

---

## New Findings (iter 2)

None. rev2 改修は局所的かつ整合的で、既存の PASS dimension に regression を起こしていない。

informational note（finding 化しない）: `keyboardListener` / `clipboardAdapter` の grep gate は `\b(import|require|from)\b` の AND ガードで false positive を抑えているが、将来 docstring が module 名を字句的に言及した場合 noise が増える可能性。Phase 5/6 で必要なら `^\s*import\b.*['"][^'"]+/<module>['"]` 形に絞ることを検討。

---

## Routing Recommendation

| Finding | Status | Optional follow-up |
|---------|--------|--------------------|
| FIND-BE-3-001..008, 012 | RESOLVED | — |
| FIND-BE-3-009 | UNRESOLVED (informational) | Phase 2c docstring/naming（任意） |
| FIND-BE-3-010 | UNRESOLVED (latent risk) | Phase 2c で `caretOffsetFromSelection` 抽出（任意） |
| FIND-BE-3-011 | PARTIAL | Phase 2c で eslint rule 追加（任意） |

全 CRITICAL と全 MAJOR が RESOLVED。残り 3 MINOR は spec で正当化された情報的事項であり Phase 5 (formal hardening) や Phase 6 (収束) を阻害しない。

**Overall**: **PASS**.
