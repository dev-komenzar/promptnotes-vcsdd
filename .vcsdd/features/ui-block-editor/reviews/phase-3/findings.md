# Phase 3 Adversarial Review Findings — ui-block-editor

**Reviewer**: vcsdd-adversary (fresh context, strict mode)
**Reviewed**: 2026-05-09
**Verdict**: **FAIL** — 2 CRITICAL + 6 MAJOR + 4 MINOR

## Dimension verdicts

| Dimension | Verdict |
|-----------|---------|
| req_prop_test_traceability | PASS |
| prop_test_coverage | PASS（カタログ完備、ただし test 強度は spec_adherence 側で別途指摘） |
| spec_adherence | **FAIL** |
| nfr_adherence | **FAIL** |
| test_quality | **FAIL** |
| adapter_contract | PASS |
| edge_case_implementation | **FAIL** |

---

## CRITICAL

### FIND-BE-3-001 — control-char strip テストが tautological（strip を実証していない）

PROP-BE-046 の 3 件のテスト (`paragraph: 'ab'` U+0001、`paragraph: U+007F`、`code: U+0001`) は textContent に制御文字を含めず、strip 後の値をそのまま assertion している。`sanitiseContent` を恒等関数に書き換えても通る。

**Evidence**: `src/lib/block-editor/__tests__/dom/block-element.dom.vitest.ts:445-457, 467-473, 483-489`、`BlockElement.svelte:121-142`、`behavioral-spec.md:905-914`

**Fix**: textContent に実際の `` / `` を含めるよう書き直す。Phase 2a/2b。

### FIND-BE-3-002 — REQ-BE-006 の split 分岐（中央 Enter）テストが存在しない

PROP-BE-026 の DOM テストは insert 分岐のみで、`dispatchSplitBlock` 呼び出し・`offset` 引数・`event.preventDefault()`・`dispatchInsertBlockAfter` 非呼び出しを検証する split 分岐テストが欠如している。

**Evidence**: `block-element.dom.vitest.ts:276-294`、`BlockElement.svelte:206-214`、`behavioral-spec.md:325-328`

**Fix**: `Range.setStart(textNode, n)` で caret を mid に設定し、Enter 発火後 `dispatchSplitBlock({offset: n, ...})` を asserts するテストを追加。Phase 2a。

---

## MAJOR

### FIND-BE-3-003 — PROP-BE-039 が positive assertion を欠く

REQ-BE-006 §Exclusivity の AC は「`dispatchChangeBlockType` のみが発火」も含むが、テストは Insert/Split が呼ばれないことしか確認していない。

**Evidence**: `block-element.dom.vitest.ts:296-310`、`behavioral-spec.md:328`

**Fix**: SlashMenu open + Enter で `dispatchChangeBlockType('paragraph')` が 1 回呼ばれることを追加検証。Phase 2a。

### FIND-BE-3-004 — REQ-BE-009 の SlashMenu close-on-removed-`/` と filter テスト欠如

EC-BE-002（`/` 削除で SlashMenu フィルタ更新）と EC-BE-003（`/` 全削除で close）に対応するテストが無い。`BlockElement.svelte:171-178` の handleInput 内 SlashMenu 制御ロジックが未検証。

**Evidence**: `behavioral-spec.md:387-391, 743-759`、`BlockElement.svelte:171-178`

**Fix**: `/heading` 入力時のフィルタテストと `''` 入力時の close テストを追加。Phase 2a。

### FIND-BE-3-005 — PROP-BE-044 grep gate が spec と不一致

verification-architecture.md は全 directory grep を要求するが、実装は 2 ファイルのみ。残りの 4 つの .svelte ファイルに `REQ-EDIT/PROP-EDIT/EC-EDIT` 残骸が残存。

**Evidence**: `sprint-4.gates.test.ts:138-147`、`verification-architecture.md:165`、`BlockElement.svelte:15`、`SlashMenu.svelte:8-9`、`BlockDragHandle.svelte:8`、`SaveFailureBanner.svelte:8-9`

**Fix**: spec を NFR-BE-007 と整合させて 2 ファイル限定にするか、4 .svelte の docstring を rename し全 directory grep を有効化。後者推奨。Phase 4 → 1c or 2c。

### FIND-BE-3-006 — `dispatchFocusBlock` click 経路の "called once" AC 未検証

REQ-BE-002b AC は「click → 1 回」を要求するが、テストは `toHaveBeenCalled()` のみ（重複呼出しを検出しない）。引数 shape の検証も無し。

**Evidence**: `block-element.dom.vitest.ts:198-203`、`behavioral-spec.md:230`、`BlockElement.svelte:95-101`

**Fix**: `toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith({...})` に強化。Phase 2a。

### FIND-BE-3-007 — `SaveFailureBanner` が 3 つの未使用 prop を持つ

`priorFocusedBlockId`、`noteId`、`issuedAt` は destructure 後 `_` prefix で握り潰されており、REQ-BE-015/016 にも記載が無い。コンポーネント surface が spec より広い。

**Evidence**: `SaveFailureBanner.svelte:15-25`、`behavioral-spec.md:488-513`、`save-failure-banner.dom.vitest.ts:48-50`

**Fix**: 3 props を除去（spec 準拠）。Phase 4 → 1c で spec 確認後、Phase 2c で実装。

### FIND-BE-3-008 — `classifyMarkdownPrefix` の `trimmedContent` 性質テスト不足

property test は heading-3, heading-2 のみ。`# `, `- `, `* `, `1. `, ```, `> ` の `trimmedContent === suffix` 不変条件は検証されていない。

**Evidence**: `prop/blockPredicates.prop.test.ts:131-153`、`blockPredicates.ts:85-111`、`behavioral-spec.md:576-585`

**Fix**: PROP-BE-005 を全 prefix に拡張。Phase 2a。

---

## MINOR

### FIND-BE-3-009 — `splitOrInsert` property の in-block / fallback 区別

「offset === len ⇔ insert」のみで「0 ≤ offset < len ⇒ split (in-block)」と「offset > len ⇒ split (fallback)」を別断していない。実害無し（informational）。

**Fix**: 命名を分割するか docstring 改善。Phase 2c。

### FIND-BE-3-010 — `getCaretOffset` jsdom fallback の責任範囲不明確

PROP-BE-026 insert-at-end テストは jsdom Selection 不可で fallback 経路を踏んでいる。実ブラウザでは `range.startOffset` と `textContent.length` が乖離しうる。

**Fix**: `caretOffsetFromSelection` を pure helper に抽出し Tier 1 unit test。Phase 2c。

### FIND-BE-3-011 — `_` prefix の convention が脆弱

`noUnusedLocals` を黙らせるが lint で「`_` prefix は unused 維持」を強制していない。FIND-007 と同根。

**Fix**: 同 Phase 2c。

### FIND-BE-3-012 — `keyboardListener.ts` / `clipboardAdapter.ts` の dead code CI gate 欠如

EC-BE-013 が「CI build で import されないことを確認」と約束しているが、ゲートが実装されていない。

**Fix**: Tier 5 grep ゲートを追加（ファイル自身以外から import されていないことを assert）。Phase 2a。

---

## Routing Recommendation

| Phase | 対象 |
|-------|------|
| 2a (Red 追加) | FIND-001, 002, 003, 004, 006, 008, 012 |
| 2b (Green) | FIND-001（実装は既に対応、テスト追加で再検証） |
| 2c (Refactor) | FIND-005（4 svelte rename）, FIND-007（unused props 除去）, FIND-009..011 |
| 1c (spec 確認) | FIND-005（規範を NFR-BE-007 に合わせるか）, FIND-007（unused props を spec 化するか） |

両 CRITICAL を含む 8 件を Phase 2a/2c で吸収すれば overall PASS に到達できる見込み。
