---
sprintNumber: 6
feature: ui-feed-list-actions
status: draft
negotiationRound: 1
scope: |
  Sprint 6 — preview ↔ editor 排他化 + クリック導線是正。
  REQ-FEED-030 cell 1 の AC を強化し、`viewState.editingNoteId === self.noteId` AND `editingStatus ∈ {editing,saving,switching,save-failed}` AND `blockEditorAdapter !== null` (= `effectiveMount === true`) のとき `.row-button` (timestamp + body-preview + tags + tag-add + pending-switch-indicator) を `{#if !(shouldMountBlocks && blockEditorAdapter)}` (= `{#if !effectiveMount}`) で **DOM unmount** する (新 REQ-FEED-030.1)。さらに行外クリックと行内 BlockElement クリックの責任分担を明文化する (新 REQ-FEED-034.1/2)。
  Sprint 6 covers: 新 REQ-FEED-030.1, 新 REQ-FEED-034.1/2, 新 EC-FEED-021..024, PROP-FEED-S6-001..007 (FIND-S6-CONTRACT-002 解消)。EC-FEED-021 の MutationObserver 中間状態観測テストは spec で deferred 記録済み (state.json `openDeferrals` slot `S6-EC-FEED-021-mutation-observer`) — Phase 3 reviewer はこれを incompleteness として flag しない。
  Sprint 6 は **`FeedRow.svelte` の DOM 構造変更のみ** で完結する。`FeedList.svelte`, `+page.svelte`, `feedReducer.ts`, `tauriFeedAdapter.ts`, `editingSessionChannel.ts`, `createBlockEditorAdapter.ts`, `src-tauri/src/*.rs` は変更しない。
  Out of scope (Step 5 / Step 6 で扱う): (a) Rust 側 AppStartup Step 4 の新規ノート auto-create (`app-startup-runtime` feature)、(b) Group B 9 ハンドラの Rust 実装 (`block-persistence` feature)。これらは Sprint 6 完了後の別 feature で対応する。
redLines:
  - "Sprint 5 の全 PROP-FEED-S5-001..022 は Sprint 6 完了後も regression PASS でなければならない。"
  - "Sprint 5 で確立した 1909 bun + 223 vitest テストは Sprint 6 でも全数 PASS。"
  - "Rust emit ordering (editing_session_state_changed → feed_state_changed) は Sprint 6 で変更しない。Sprint-4 baseline tag (vcsdd/ui-feed-list-actions/sprint-4-baseline, commit d30ab13) からの diff が emit 行で 0。PROP-FEED-S5-013 を Sprint 6 でも維持する。"
  - "preview 隠蔽は `{#if !(shouldMountBlocks && blockEditorAdapter)}` (= `{#if !effectiveMount}`) による **DOM unmount** で行うこと。`{#if !shouldMountBlocks}` 単独では adapter null race (EC-FEED-024) で空白行になるため不可。`display:none` / `visibility:hidden` / `opacity:0` 等の CSS 隠蔽も禁止 (PROP-FEED-S6-003)。"
  - "Sprint 5 で確立した REQ-FEED-030 truth table 4 セルの DOM 状態 (BlockElement count) は Sprint 6 で破壊しない。Sprint 6 は cell 1 で preview/feed-row-button が unmount される旨を **追加** assert するのみ。"
  - "FIND-S5-PHASE3-004 で確立した REQ-FEED-031 fallback dispatch chain (insert→focus, payload に id を含めない、UUID は dispatchFocusBlock の blockId にのみ載る) は Sprint 6 で変更しない。"
  - "Sprint 6 の **production code 変更は `FeedRow.svelte` 1 ファイルのみ**。test files / VCSDD artifacts / test infrastructure config (vitest.config.ts, bunfig.toml) / Sprint 5 既存 test の Sprint 6 supersession 対応修正 (`feed-row-best-effort-dispatch.dom.vitest.ts` + `main-route-wiring.dom.vitest.ts`) は CRIT-304 で許容済み。それ以外の production file (+page.svelte / FeedList.svelte / feedReducer.ts / tauriFeedAdapter.ts / editingSessionChannel.ts / createBlockEditorAdapter.ts / promptnotes/src-tauri/src/*.rs) の変更があれば red line 違反 (FIND-S6-CONTRACT-iter2-001 解消、CRIT-304 と整合)。"
criteria:
  - id: CRIT-300
    dimension: spec_fidelity
    description: REQ-FEED-030.1 — cell 1 で preview / feed-row-button が DOM から完全に unmount される。truth table 全 5 行 (cell 1 effectiveMount=true, EC-FEED-024 row, cell 2, cell 3, cell 4) で preview / feed-row-button / block-element / delete-button の DOM 存在状態を assert する (PROP-FEED-S6-001 構造 truth table)。`display: none` / `visibility: hidden` / `opacity: 0` の CSS 隠蔽方式が `FeedRow.svelte` の `<style>` ブロックに導入されていない (整数 0 のみ; `opacity: 0.04` 等の小数は誤マッチしない厳密 regex)。
    weight: 0.28
    passThreshold: PROP-FEED-S6-001 (cell 1 + EC-FEED-024 row + cell 2/3/4 全 5 行 PASS, structural truth table 観点) AND PROP-FEED-S6-003 (`grep -E '(display:[[:space:]]*none[[:space:]]*[;}]|visibility:[[:space:]]*hidden[[:space:]]*[;}]|opacity:[[:space:]]*0[[:space:]]*[;}])' promptnotes/src/lib/feed/FeedRow.svelte | wc -l` の出力が 0; FIND-S6-CONTRACT-006 解消 grep -E ERE 形式 + FIND-S6-CONTRACT-iter2-005 解消: GNU `\s` 拡張ではなく POSIX `[[:space:]]` を使用し macOS BSD grep でも portable)。
  - id: CRIT-301
    dimension: edge_case_coverage
    description: REQ-FEED-030.1 / EC-FEED-024 — fast-check non-coexistence + non-emptiness property: 任意の `editingStatus × editingNoteId × editingSessionState × serverBlocksLength ∈ {0..5} × blockEditorAdapter ∈ {Mock, null}` で (a) `[data-testid="row-body-preview"]` と `[data-testid="block-element"]` が DOM 上に同時に存在することはない (排他)、(b) 両方とも不在ということもない (網羅、空白行を作らない)。EC-FEED-024 の adapter null race も同 property でカバー。seed 固定 (`0x56BABE`) で **numRuns ≥ 500 (5 cells × ≥ 50 cases stratification, 統計的 margin)** で 0 反例 (FIND-S6-SPEC-iter5-002 / FIND-S6-CONTRACT-iter3-001 解消、description と passThreshold の数値整合)。
    weight: 0.20
    passThreshold: PROP-FEED-S6-002 fast-check (`seed: 0x56BABE`, **numRuns ≥ 500**, 0 counter-example; FIND-S6-CONTRACT-iter2-004 解消: numRuns 250 の uniform stratification では 5 cells × ≥50 が確率的に保証されないため 500 に倍増し統計的に十分な margin を確保) — stratification verification: test ファイルは per-cell run-count を test 終了時に counter object として export し、別 assertion で各 cell key について `expect(strataCounts.cell1).toBeGreaterThanOrEqual(50)` 等を **5 件個別 assert** する (FIND-S6-CONTRACT-iter2-003 解消: `toMatchObject` ではなく `toBeGreaterThanOrEqual` を per-key 5 件で記述する vitest 標準形式) AND PROP-FEED-S6-007 (adapter null 時の dispatch 0-calls 動的観測)。
  - id: CRIT-302
    dimension: implementation_correctness
    description: REQ-FEED-034.1/2 — 行外クリック (cell 3 の `feed-row-button`) → `tauriFeedAdapter.dispatchSelectPastNote` が 1 回呼ばれ、cell 1 で `.feed-row` 直接 click でも `dispatchSelectPastNote` が呼ばれず (行為観点)、cell 1 で `block-element` クリックは `onRowClick` を発火せず `blockEditorAdapter.dispatchFocusBlock` を 1 回呼ぶ。FIND-S6-CONTRACT-001 解消: 「new mount predicate の機能正当性 (RED→GREEN process evidence)」は CRIT-300 の structural truth table 観点に集約され、本 CRIT-302 は **行為観点 (click routing) の 3 つの behavioral assertion** に責務を絞る。これにより S6-001 の double-counting を解消。
    weight: 0.27
    passThreshold: PROP-FEED-S6-004 (cell 3 click → dispatchSelectPastNote called once with `(noteId, vaultPath, issuedAt)`) AND PROP-FEED-S6-005 (cell 1 で `.feed-row` 直接 click → dispatchSelectPastNote 0 calls) AND PROP-FEED-S6-006 (cell 1 block-element click → onRowClick 0 calls + dispatchFocusBlock 1 call)。RED→GREEN process evidence は `.vcsdd/features/ui-feed-list-actions/evidence/sprint-6-{red,green}-phase.log` に記録済み (CRIT-300 の grading で参照可能、本 CRIT では別途要求しない)。
  - id: CRIT-303
    dimension: structural_integrity
    description: Sprint 5 baseline preservation — Sprint 5 の全 PROP-FEED-S5-001..022 (PROP-501..522) が Sprint 6 完了時点でも regression PASS。`tauriFeedAdapter.dispatchSelectPastNote` の既存 IPC 契約は変更しない。Rust emit 順序 (PROP-FEED-S5-013) は Sprint 6 でも 0-diff。
    weight: 0.15
    passThreshold: `bun test src/` の出力で **1901 pass + 4 skip + 4 todo + 0 fail** (= 1909 tests total = Sprint 5 baseline と同一) AND `bun run test:dom` の出力で **240 tests passed (240) + 0 fail = 22 test files passed (22)** (= Sprint 5 baseline 223 + Sprint 6 新規 17、FIND-S6-CONTRACT-iter2-002 / FIND-S6-CONTRACT-007 解消: 1909 の内訳 = 1901 pass + 4 skip + 4 todo を正確に明示) AND `git diff vcsdd/ui-feed-list-actions/sprint-4-baseline..HEAD -- promptnotes/src-tauri/src/editor.rs promptnotes/src-tauri/src/feed.rs | grep -E '^[+-].*emit\(.(editing_session_state_changed|feed_state_changed).'` が exit 1 (FIND-S6-CONTRACT-008 解消: 正しい `promptnotes/` prefix のフルパス、brace expansion 不使用)。
  - id: CRIT-304
    dimension: verification_readiness
    description: 1 ファイル制約 — Sprint 6 の git diff は (a) production 変更: `promptnotes/src/lib/feed/FeedRow.svelte` のみ; (b) VCSDD artifacts: `.vcsdd/features/ui-feed-list-actions/(specs|contracts|reviews|evidence|verification|state.json)` 配下; (c) 新規テストファイル: `promptnotes/src/lib/feed/__tests__/dom/feed-row-preview-exclusivity.{dom.vitest,property.test}.ts`、`promptnotes/src/lib/feed/__tests__/dom/feed-row-click-routing.dom.vitest.ts` (FIND-S6-PHASE3-002 解消: 当初予定の test wrapper Svelte component は実装段階で property test が FeedRow を直接 mount できることが判明したため不要となり削除); (c-extra) Sprint 5 baseline 維持のための既存テスト微修正: `promptnotes/src/lib/feed/__tests__/dom/feed-row-best-effort-dispatch.dom.vitest.ts` (Sprint 5 PROP-FEED-S5-022 (d) を Sprint 6 supersession 対応に書き換え)、`promptnotes/src/routes/__tests__/main-route-wiring.dom.vitest.ts` (mount gate regex 更新); (d) **test infrastructure config**: `promptnotes/vitest.config.ts` (DOM-backed property test の include pattern 追加) および `promptnotes/bunfig.toml` (bun test から jsdom-backed file を除外する pathIgnorePatterns) — これらは production behavior に影響せず Sprint 6 新規テストの実行に必要な設定。`+page.svelte` / `FeedList.svelte` / `feedReducer.ts` / `tauriFeedAdapter.ts` / `editingSessionChannel.ts` / `createBlockEditorAdapter.ts` / `promptnotes/src-tauri/src/*.rs` は変更しない。
    weight: 0.10
    passThreshold: 以下の shell command が exit 1 (no unauthorized hits) を返す (FIND-S6-CONTRACT-003 解消): `git diff main..HEAD --name-only | grep -vE '^(promptnotes/src/lib/feed/FeedRow\.svelte|\.vcsdd/features/ui-feed-list-actions/(specs|contracts|reviews|evidence|verification|state\.json|coherence\.json)/?.*|\.vcsdd/(active-feature\.txt|index\.json|history\.jsonl)|promptnotes/src/lib/feed/__tests__/dom/(feed-row-preview-exclusivity\.(dom\.vitest|property\.test)\.ts|feed-row-click-routing\.dom\.vitest\.ts|feed-row-best-effort-dispatch\.dom\.vitest\.ts)|promptnotes/src/routes/__tests__/main-route-wiring\.dom\.vitest\.ts|promptnotes/(vitest\.config\.ts|bunfig\.toml))$'`。
gates:
  phase2: |
    Red phase (Phase 2a) entry — TDD invariant clarification (FIND-S6-SPEC-006 / FIND-S6-SPEC-011 / FIND-S6-SPEC-iter2-002 解消):
    Failing test (RED) 必須 (Sprint 5 baseline で production code が必ず FAIL するもの):
      - PROP-FEED-S6-001 (cell 1 で preview unmount assertion → Sprint 5 では preview マウントのため必ず FAIL)
      - PROP-FEED-S6-002 (non-coexistence + non-emptiness fast-check → Sprint 5 では cell 1 で同時存在のため必ず反例検出 FAIL)
      - PROP-FEED-S6-007 (adapter null + dispatch 0 calls 動的観測 → Sprint 5 では effectiveMount 条件未導入のため adapter null 時でも dispatch attempt が発生しうる挙動が Sprint 6 effectiveMount 追加で変わる → 初期 RED)
    Regression guard (実装後 PASS 確認, Sprint 5 baseline で既に PASS する既存挙動の維持):
      - PROP-FEED-S6-003 (grep audit, Sprint 5 baseline 0 hit を Sprint 6 でも維持)
      - PROP-FEED-S6-004 (cell 3 click; Sprint 1 PROP-FEED-001 既存契約の Sprint 6 再 assert、production code は Sprint 1 から PASS のため初期 PASS 期待)
      - PROP-FEED-S6-005 (`.feed-row` 直接 click が dispatchSelectPastNote を呼ばない既存挙動の維持)
      - PROP-FEED-S6-006 (block-element click が onRowClick を発火しない既存挙動の維持)
    regression baseline (Sprint 1-5 全テスト) green。
  phase3: |
    Adversarial review (Phase 3) entry: pure modules ≥ 95% branch coverage 維持 (Sprint 6 で pure helper 追加なし); all Required:true PROPs S6-001..007 PASS; PROP-FEED-S6-002 fast-check (seed 0x56BABE) で 0 counter-example。Sprint 5 PROP-FEED-S5-001..022 全 regression PASS。
  phase5: |
    Formal hardening (Phase 5) entry: see verification-architecture.md §Sprint 6 Phase 5 gate.
---

# Sprint 6 Contract — ui-feed-list-actions

Draft contract for Sprint 6 (preview ↔ editor 排他化 + クリック導線是正)。Phase 1c spec gate と contract review は本ドキュメント作成後に実行する。

## Critical scope acknowledgement

Sprint 6 は Sprint 5 完了後の動作検証で発覚した「preview と editor の DOM 共存」を解消する。本 Sprint は **`FeedRow.svelte` の DOM 構造変更のみ**で完結し、Rust 側変更・他 UI ファイル変更は **明示的に out of scope**。Step 5 (`app-startup-runtime`) および Step 6 (`block-persistence`) は別 feature として後続で扱う (`docs/tasks/block-based-ui-spec-migration.md` Step 4〜6 参照)。

Sprint 5 で意図的にスコープ外とされた「ユーザー入力の Rust 永続化」は Sprint 6 でも引き続きスコープ外。Sprint 6 は UX (preview と editor の視覚的排他) の問題解消のみを担当する。

## Adversary calibration notes for Phase 3

- Sprint 6 は **`FeedRow.svelte` 1 ファイル変更のみ** が原則。他のファイル (特に Rust) を変更要求する findings は CRIT-304 違反として reject する。test wrapper Svelte component (`__tests__/dom/_helpers/` 配下) は許容。
- preview の隠蔽は `{#if !(shouldMountBlocks && blockEditorAdapter)}` で **DOM unmount** すること。`display:none` 提案は CRIT-300 / PROP-FEED-S6-003 違反。
- `delete-button` を cell 1 で unmount しないことは意図的設計 (`.row-layout` 直下の sibling として残す, `isDeleteButtonDisabled` で `disabled` 属性制御)。これを「unmount 漏れ」として flag しない。PROP-FEED-S6-001 cell 1 row で `delete-button` の DOM 存在 + disabled 状態を assert する。
- cell 2 (`editingStatus === 'idle'` AND `editingNoteId === self.noteId`) は architecturally unreachable (`EditingSessionStateDto` 5-arm 定義の Idle arm が `currentNoteId` フィールドを持たないこと、および REQ-FEED-029 wire shape table row 1 の feedReducer.DomainSnapshotReceived ミラー invariant、`docs/domain/aggregates.md §EditingSessionState` 5-arm 定義による。REQ-FEED-009 — pending-switch indicator — ではない、FIND-S6-SPEC-iter3-002 citation 修正)。defensive test では preview 表示で OK (Sprint 5 の cell 2 既存挙動継承)。
- EC-FEED-024 (`blockEditorAdapter === null` のとき preview を残す) は Sprint 6 の意図的仕様。これを「adapter 注入の責務違反」として flag しない。`+page.svelte` 側の adapter 初期化タイミングは Sprint 5 から変更しない (out of scope)。
- 新 REQ-FEED-034 は責任分担の明文化のみで、新規実装を導入しない (BlockElement の click → dispatchFocusBlock は ui-block-editor REQ-BE-002b の既存実装、`feed-row-button` の click → dispatchSelectPastNote は Sprint 1 既存実装)。
- DOM 階層の正しい記述: `.row-layout` と `.block-editor-surface` が `.feed-row` 直下の siblings であり、`.row-button` は `.row-layout` の中に閉じている (詳細は behavioral-spec.md REQ-FEED-034 §DOM 階層の正確な記述 参照)。`.row-button` と `.block-editor-surface` を直接 sibling と表記する findings は誤り (FIND-S6-SPEC-001 の修正済み)。
- fast-check property test (PROP-FEED-S6-002) は random `editingStatus × editingNoteId × editingSessionState × serverBlocksLength × blockEditorAdapter` の組合せで non-coexistence + non-emptiness を assert する。FeedRow が当該 prop の組合せで mount できるよう、テスト wrapper (`FeedRowSprint6PropertyWrapper.svelte` 仮称) を新規作成する。Sprint 5 の `FeedRowSprint5Wrapper.svelte` を参照モデルとする。
- Phase 2a Red phase で「failing test (RED) 必須」と「regression guard (実装後 PASS 確認)」を区別する。S6-003/S6-005/S6-006 は regression guard で初期 PASS 想定 (TDD invariant 違反ではない)。
- **PROP-FEED-S6-007 は PROP-FEED-S6-001 EC-FEED-024 row の orthogonal observation** (S6-001 = 静的 DOM 不在 / S6-007 = 動的 dispatch 0-calls)。両者を冗長 / 統合せよとする findings は reject する (FIND-S6-CONTRACT-010 解消、spec FIND-S6-SPEC-iter2-005 で確立した orthogonality)。
- **EC-FEED-021 の MutationObserver 中間状態観測テストは意図的 deferral** (verification-architecture.md Sprint 6 Coverage Matrix で `state.json openDeferrals` slot `S6-EC-FEED-021-mutation-observer` として記録)。これを incompleteness として flag しない (FIND-S6-CONTRACT-005 解消)。Sprint 6 では PROP-FEED-S6-002 fast-check の **静的 snapshot** が non-coexistence を保証し、Svelte 5 reactivity 同期 flush が中間状態の non-emission を間接保証する。
- Sprint 5 既存 test の Sprint 6 supersession に伴う修正 (`feed-row-best-effort-dispatch.dom.vitest.ts` PROP-FEED-S5-022 (d), `main-route-wiring.dom.vitest.ts` mount gate regex) は CRIT-304 (c-extra) で許容済み。これらを「Sprint 5 test に手を入れている」と CRIT-304 違反として flag しない。
