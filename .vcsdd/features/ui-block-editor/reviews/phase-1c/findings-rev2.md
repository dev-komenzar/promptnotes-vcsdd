# Phase 1c Adversarial Review Findings — ui-block-editor (Iteration 2 / rev2)

**Reviewer**: vcsdd-adversary (fresh context, strict mode, session phase-1c-strict-2)
**Reviewed**: 2026-05-09
**Verdict**: **PASS** — 5/5 CRITICAL all RESOLVED; 9/10 MAJOR RESOLVED + 1 PARTIAL（Phase 2c carry-over with explicit NFR）; 5/5 MINOR RESOLVED. 2 new MINOR findings filed (non-blocking).

---

## Disposition of Iteration-1 Findings

### CRITICAL (5) — All RESOLVED

#### FIND-BE-1C-001 — Enter while SlashMenu is open double-dispatches → **RESOLVED**
`behavioral-spec.md` REQ-BE-006 §"Exclusivity with SlashMenu" を追加し AC で「`slashMenuOpen === true` で Enter → Insert/Split が呼ばれない」を要求。`verification-architecture.md` PROP-BE-039 で Tier 4 検証。

#### FIND-BE-1C-002 — REQ-BE-026 misstates the dispatch surface → **RESOLVED**
REQ-BE-026 を 9 (Block) + 5 (Save/Session) + 2 (Other) = 16 の表に書き直し、Tag 系 2 件は scope-out として明記。

#### FIND-BE-1C-003 — REQ-BE-007/008 collision lacks tie-breaker → **RESOLVED**
「REQ-BE-007 が勝つ」優先順位を spec 化、EC-BE-011 を AC へ昇格。

#### FIND-BE-1C-004 — UI→domain `dispatchFocusBlock` の REQ がない → **RESOLVED**
REQ-BE-002b を新設し focusin / click 双方の経路を AC 化。PROP-BE-038 で Tier 4 検証。

#### FIND-BE-1C-005 — PROP-BE-038/039 ID gap; "41" 総数誤り → **RESOLVED**
PROP-BE-038/039 を埋め、catalog を PROP-BE-001..047 で連続化。総数 47 = 1 + 20 + 18 + 8。PROP-BE-045 で CI 連続性検査。

### MAJOR (10) — 9 RESOLVED + 1 PARTIAL

#### FIND-BE-1C-006 — slashQuery 初期化 / open-condition / prefix-table conflict → **RESOLVED**
REQ-BE-009 を書き直し、`slashMenuOpen=true, slashQuery=''` 初期化と `'/'` を prefix-table に含めない invariant を明記。

#### FIND-BE-1C-007 — `BlockDragHandle.onMoveBlock` 必須矛盾 → **RESOLVED**（spec、Phase 2c 持ち越しで実装）
REQ-BE-014b で `onMoveBlock` を optional 化することを spec 化。

#### FIND-BE-1C-008 — REQ-BE-001/002 ACs broken for divider → **RESOLVED**
divider 分岐の AC carve-out を追加。

#### FIND-BE-1C-009 — REQ-BE-005 ordering ambiguous; trim/no-trim → **RESOLVED**
`vi.fn().mock.invocationCallOrder` を AC 化、UI 側 trim 禁止を AC へ昇格。

#### FIND-BE-1C-010 — code prefix 表記揺れ → **RESOLVED**
バックティック 3 つ（末尾スペース不要）に統一、AC で `'```js'` ケース追加。

#### FIND-BE-1C-011 — Tier 3 substitution claim 不当 → **RESOLVED**
2 ルール（branch coverage ≥ 95% + exact value assertion）に置換、Stryker 導入は将来 task として記録。

#### FIND-BE-1C-012 — `2000` リテラル禁止 CI assertion 欠如 → **RESOLVED**
PROP-BE-043 で grep ゲート定義。

#### FIND-BE-1C-013 — Adapter Promise contract 未定義 → **RESOLVED**
"Adapter Promise 契約" セクション + PROP-BE-047 追加。

#### FIND-BE-1C-014 — `BlockContent` VO バイパス → **PARTIAL**（Phase 2c carry-over）
NFR-BE-006 + PROP-BE-046 で spec 化。実装は Phase 2c で着手。AC 例は MINOR finding 21 で補強要求。

#### FIND-BE-1C-015 — `isFocused` projection 規則欠如 → **RESOLVED**
projection formula 追加、saving/switching/save-failed 挙動明記。

### MINOR (5) — 5/5 RESOLVED（一部 Phase 2c carry-over）

#### FIND-BE-1C-016 — REQ-EDIT/PROP-EDIT 残骸 → **RESOLVED**
NFR-BE-007 + PROP-BE-044 で Phase 2c rename を要求。

#### FIND-BE-1C-017 — stale "EditorPanel handles all-blocks blur" コメント → **RESOLVED**（spec、Phase 2c で comment cleanup）
Scope-out 節で blur Internal Event 発火責務を Sprint 5 に移管と明記。

#### FIND-BE-1C-018 — getBlockTag dead code → **RESOLVED**（Phase 2c 削除予定として正当化）
AC で「非 divider は `<div>`」と固定、`getBlockTag` の存在は Phase 2c cleanup 対象。

#### FIND-BE-1C-019 — REQ-BE-027 grep regex 緩い → **RESOLVED**
両側 word boundary・scope 制限・comment 除外を grep regex に組み込み。

#### FIND-BE-1C-020 — IME composition deferral 未明記 → **RESOLVED**
Scope-out に明記、verification-architecture.md Section 7 で open question 記録。

---

## New Findings (Iteration 2)

### FIND-BE-1C-021 — NFR-BE-006 AC が control char strip を実証しない (MINOR)

**Dimension**: acceptance_criteria_precision

**Evidence**:
- `behavioral-spec.md` NFR-BE-006 の AC: 「paragraph で `'ab'` → `'ab'`」「code で `'a\nb'` → `'a\nb'`」「`''` → `''`」
- 上記 3 例はいずれも strip 対象の制御文字を含まず、PROP-BE-046 の strip 不変条件を観測する具体例がない

**Fix**: AC に以下を追加:
- paragraph で `'ab'` → `'ab'`（U+0001 strip）
- paragraph で `'line1\nline2'` → `'line1line2'`（`\n` strip）
- code で `'ab'` → `'ab'`（制御文字 strip、`\n` は保持）
- code で `'line1\nline2'` → `'line1\nline2'`（`\n` 保持）

**Routing**: Phase 1a spec amendment（任意・PASS gate を阻害しない）。Phase 2c で strip 実装着手前に追記する。

---

### FIND-BE-1C-022 — Source-of-Truth Mapping 表に REQ-BE-004 が欠落 (MINOR)

**Dimension**: coherence_with_sot

**Evidence**:
- `behavioral-spec.md` 対応表が REQ-BE-001..003 → REQ-BE-005 と飛び、REQ-BE-004 が欠落
- REQ-BE-004 は本文・AC・PROP-BE-024 で参照されているため危険性は低いが coherence 自動検証で regression を見逃す恐れ

**Fix**: 対応表に `REQ-BE-004 | UI 観察上の責務分割（FeedRow / SaveOrchestrator が idle timer リスケジュール）` を追加。

**Routing**: Phase 1a spec amendment（informative-only）。

---

## Routing Summary (Iteration 2)

| 修正先フェーズ | 対象 findings |
|--------------|--------------|
| Phase 1a 軽微補強（任意） | FIND-BE-1C-021、FIND-BE-1C-022 |
| Phase 2c 実装クリーンアップ（既に spec 化済） | FIND-BE-1C-007、014、016、017、018 |

新 MINOR 2 件は CRITICAL / MAJOR ではないため、Phase 2 へ進める前提で並行修正可能。Phase 1c gate は **PASS**。
