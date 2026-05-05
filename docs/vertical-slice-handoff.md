# Vertical Slice 完成ハンドオフ — UI feature を Sprint 2 で再開する手順

このドキュメントは、`docs/implement.md` の UI feature が **UI 層のみで止まり Rust backend や AppShell mount が未配線**になっているケースを、**新しい VCSDD sprint** として既存フィーチャを再開して完成させる手順を定義する。

`ui-feed-list-actions` で発生したのと同じパターン (Sprint 1 = UI 層、Sprint 2 = Rust + AppShell mount) を、他フィーチャに適用するためのプレイブック。

---

## 1. 何が起きているのか

`docs/implement.md` L47:

> **vertical slice であること** — 1 feature 完了で `bun run tauri dev` 上で何らかのユーザー操作が動く状態になる

しかし実際の VCSDD sprint 1 では、Spec 1a/1b が UI コンポーネント側に偏って書かれた結果、Phase 2b で **TS 側の adapter `invoke('xxx_command')` だけが書かれて Rust 側 `#[tauri::command] fn xxx_command()` が登録されない** まま `complete` まで進む傾向がある。

結果: `bun run tauri dev` で UI は描画されるが、ボタン操作が **`invoke` "command not found" エラー**で無音失敗する。

`ui-feed-list-actions` では、Sprint 1 完了後にこの問題を発見し、**Sprint 2 で Rust handlers + AppShell mount を追加実装** することで vertical slice を完成させた。

---

## 2. 影響を受けているフィーチャの判定方法

VCSDD で `complete` 済の UI フィーチャに対して、以下を実行:

```bash
# TS adapter が呼ぶ Rust command 名を抽出
grep -hE "'[a-z_]+'" promptnotes/src/lib/<feature>/tauri*Adapter.ts | grep -oE "'[a-z_]+'"

# Rust 側で実装されている command を抽出
grep -B 1 '#\[tauri::command\]' promptnotes/src-tauri/src/lib.rs | grep '^fn ' | awk '{print $2}' | sed 's/(.*//'
```

両者の差集合 = **未配線 commands**。これが空でないなら vertical slice 未達。

### 既知の状態 (2026-05-05 時点)

| feature | TS adapter 期待 commands | Rust 側 lib.rs 登録 | vertical slice |
|---|---|---|---|
| `ui-app-shell` | `try_vault_path`, `invoke_configure_vault`, `settings_load`, `settings_save`, `fs_stat_dir`, `fs_list_markdown`, `fs_read_file` | 同 7 件全て登録済 | ✅ 達成 |
| `ui-editor` | `edit_note_body`, `trigger_idle_save`, `trigger_blur_save`, `retry_save`, `discard_current_session`, `cancel_switch`, `copy_note_body`, `request_new_note` | **0 件** | ❌ **未達** |
| `ui-feed-list-actions` | `select_past_note`, `request_note_deletion`, `confirm_note_deletion`, `cancel_note_deletion`, `fs_trash_file`, `feed_initial_state` | 同 6 件全て登録済 (Sprint 2 で追加) | ✅ 達成 |
| `ui-tag-chip` | (未着手) | (未着手) | — |
| `ui-filter-search` | (未着手) | (未着手) | — |

**最優先**: `ui-editor` は新規ノート作成 (Ctrl+N) や保存などコア機能が動かない状態。

---

## 3. Sprint 2 を開く手順 (パターンB)

### Step 1: 状態確認

```bash
node -e "
const path = require('path');
const lib = require(path.join(process.env.HOME, '.claude/plugins/cache/vcsdd-claude-code/vcsdd/1.0.0/scripts/lib/vcsdd-state.js'));
const s = lib.readState('<feature-name>');
console.log('phase:', s.currentPhase, 'sprintCount:', s.sprintCount);
"
```

`currentPhase: complete` であることを確認。

### Step 2: アクティブフィーチャを切り替え (必要なら)

```bash
echo '<feature-name>' > .vcsdd/active-feature.txt
```

### Step 3: `complete → 1a` で sprint 2 を開く

```bash
node -e "
const path = require('path');
const lib = require(path.join(process.env.HOME, '.claude/plugins/cache/vcsdd-claude-code/vcsdd/1.0.0/scripts/lib/vcsdd-state.js'));
const { transitionPhase } = lib;
transitionPhase('<feature-name>', '1a', 'Sprint 2: vertical slice (Rust backend + AppShell mount per implement.md L82-86)');
"
```

`STRICT_TRANSITION_MAP['complete'] = ['1a', '3']` で許可されている遷移。

### Step 4: vcsdd-builder agent に Sprint 2 の実装を委譲

下の **Builder Prompt Template** を、対象フィーチャ用に値を埋めて Agent ツールで `vcsdd-builder` を呼び出す。

### Step 5: vcsdd-adversary で Phase 3 sprint-2 review

- gate 名は `3-sprint-2` として `recordGate` する (Sprint 1 の `3` ゲートを上書きしない)
- iteration limit = 5、findings をルーティングして iter-2/3 で潰す

### Step 6: Phase 5 verifier、Phase 6 orchestrator

それぞれ sprint 2 用に追加コミット + タグを切る:
- `vcsdd/<feature>/sprint-2-phase-5`
- `vcsdd/<feature>/sprint-2-phase-6`

### Step 7: PR description 更新 / 新規 PR 起票

既存 PR がある場合は `gh pr edit <num>` で description 更新。新規ブランチなら `gh pr create`。

---

## 4. Builder Prompt Template (Sprint 2 vertical slice)

> 以下を `Agent` ツール `subagent_type=vcsdd:vcsdd-builder` で投げる。`<>` 部分を埋める。

```
VCSDD Sprint 2 を `<feature-name>` フィーチャに対して実行してください。
docs/implement.md の vertical slice 要件 (L47, L82-86, L248-252) を満たすため、
**Rust backend handlers + Tauri event emitter + AppShell main route 配線** を完成させてください。

## コンテキスト

- 作業ディレクトリ: /home/takuya/ghq/github.com/dev-komenzar/promptnotes-vcsdd
- フィーチャ: <feature-name> (mode=strict, sprintCount=1, currentPhase=1a)
- Sprint 1 baseline: <既存テスト数を bun + vitest で記載>
- ブランチ: feature/<feature-name> (Sprint 1 PR <#NN> を更新する形で進める)

## 必読

1. docs/implement.md L<対応行> (feature スコープ) + L47 (vertical slice 原則) + L248-252 (Phase 2b 配線レイヤ)
2. docs/vertical-slice-handoff.md (このプレイブック)
3. promptnotes/src-tauri/src/lib.rs (現状 Rust commands)
4. promptnotes/src/lib/<feature>/tauri<Feature>Adapter.ts (TS が期待する commands)
5. promptnotes/src/lib/<feature>/<Feature>StateChannel.ts (TS が listen する event)
6. promptnotes/src/lib/<feature>/types.ts (DTO shape)
7. promptnotes/src/routes/+page.svelte (現状 mount 状態)
8. .vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md の "Sprint 2 Extensions" セクション (REQ-FEED-019..023)
   — これを参考に同パターンで自フィーチャの spec patch を書く
9. .vcsdd/features/ui-feed-list-actions/src-tauri/src/feed.rs
   — 同パターンの Rust 実装リファレンス (DTO + serde camelCase + AppHandle::emit + scan ヘルパー)

## Sprint 2 で完成させる項目

### Phase 1a: spec patch (既存 spec 末尾に追記)

`.vcsdd/features/<feature-name>/specs/behavioral-spec.md` 末尾に **Sprint 2 Extensions** セクションを追加:
- REQ-<FEAT>-<NN+1>: <command-1> Tauri command 仕様
- REQ-<FEAT>-<NN+2>: その他 handler の責務
- REQ-<FEAT>-<NN+3>: <feature>_state_changed Tauri event の emit ルール (該当する場合)
- REQ-<FEAT>-<NN+4>: 初期化 command (該当する場合)
- REQ-<FEAT>-<NN+5>: +page.svelte main route の AppShell 内 mount 仕様

### Phase 1b: spec patch

verification-architecture.md に追記:
- Rust 側 testing tier: cargo test integration tests
- AppShell mount の DOM integration test

Phase 1c の re-review は architect が事前承認済みとして skip
(sprint 2 は実装拡張、spec 構造は変わらない)。

### Phase 2a: Red phase (失敗するテストを書く)

新規追加すべきテスト:
- promptnotes/src-tauri/tests/<feature>_handlers.rs (cargo integration test)
- promptnotes/src/routes/__tests__/main-route-<feature>.dom.vitest.ts

これらが fail することを確認。

### Phase 2b: Green phase

#### 1. Rust backend (`promptnotes/src-tauri/src/<feature>.rs` 新規)

- 各 #[tauri::command] handler の DTO + serde camelCase 整合
- AppHandle::emit('<feature>_state_changed', payload) パターン
- Error mapping は既存ドメイン feature の Failure 型と整合
- panic!/unwrap 禁止、unsafe 禁止

#### 2. Rust モジュール登録

`lib.rs` の `pub mod` と `invoke_handler!` macro に追加:

```rust
pub mod <feature>;

.invoke_handler(tauri::generate_handler![
    /* 既存の commands */,
    <feature>::command1,
    <feature>::command2,
    /* ... */
])
```

#### 3. TS frontend (`promptnotes/src/routes/+page.svelte` 更新)

AppShell 内に <Feature> コンポーネントを mount。
DESIGN.md tokens (whisper border #e9e9e7, warm neutral #f7f7f5) 準拠。
重要: AppShell が既に <main> を持つので、ネストする場合は <div class="..."> を使う
(ui-feed-list-actions FIND-S2-02 と同じ罠を避ける)。

### Phase 2c: refactor

green を維持しつつ、Rust モジュール構造の整理、命名整合、TS 側 effect の cleanup。

## 検証

```bash
cd promptnotes/src-tauri && cargo test 2>&1 | tail -10
cd promptnotes/src-tauri && cargo check 2>&1 | tail -5
cd promptnotes && bun test --run 2>&1 | tail -5
cd promptnotes && bun x vitest run 2>&1 | tail -5
cd promptnotes && bun run check 2>&1 | tail -10
```

全 pass + 新規 type errors 0。Sprint 1 baseline の regression 0。

evidence: .vcsdd/features/<feature-name>/evidence/sprint-2-green-phase.log

## state.json 更新

```javascript
const path = require('path');
const lib = require(path.join(process.env.HOME, '.claude/plugins/cache/vcsdd-claude-code/vcsdd/1.0.0/scripts/lib/vcsdd-state.js'));
const { transitionPhase, recordGate } = lib;
transitionPhase('<feature-name>', '1b');
transitionPhase('<feature-name>', '1c');
recordGate('<feature-name>', '1c-sprint-2', 'PASS', 'adversary', { iteration: 1, sprint: 2, scope: 'spec patch only, sprint 2' });
recordGate('<feature-name>', '1c-sprint-2', 'PASS', 'human', { iteration: 1, sprint: 2, approved: 'pre-approved by architect for sprint 2 scope extension' });
transitionPhase('<feature-name>', '2a');
transitionPhase('<feature-name>', '2b');
transitionPhase('<feature-name>', '2c');
```

⚠️ 注意: gate 名は `1c-sprint-2` のように suffix を付けて Sprint 1 のゲートと干渉させない。

## proofObligations 追加時の制約

state.json schema は `id: ^PROP-\d{3,}$` パターン (3 桁以上の数字のみ) を要求する。
`PROP-FEED-S2-001` のような英字混じりは schema reject される。
sprint 2 で追加する PROP の id は `PROP-100`, `PROP-101`... のように **3 桁以上の数字**で命名し、
artifact フィールドに sprint 識別子と元仕様 ID を含める:

```javascript
{ id: 'PROP-100', tier: 1, required: true, status: 'proved',
  artifact: '[PROP-EDIT-S2-001 sprint-2] tests/path/file.rs::test_name' }
```

## コミット & push

各 phase 完了時にコミット。最終的に:

```bash
git add promptnotes/src-tauri/ promptnotes/src/routes/ promptnotes/src/lib/<feature>/ \
        promptnotes/Cargo.lock .vcsdd/
git commit -m "vcsdd(2): <feature-name> Sprint 2 — vertical slice complete"
git tag vcsdd/<feature-name>/sprint-2-phase-2c
git push
```

## 完了レポート (350 words 以内)

- Rust commands 追加数 + lines of code
- 既存 Rust commands と新規追加の重複確認
- TS frontend 変更 (+page.svelte 行数 delta)
- Cargo.toml 依存追加
- bun + vitest + cargo test 結果
- 型 errors / warnings
- bun run dev で main route が動くか
- 想定外の regression
- 現在の state.json.currentPhase (`3` であるべき)
- Phase 3 adversary が確認すべきポイント
  (新規 surface area: Rust handler の error mapping、event emit ordering、
   AppShell layout DESIGN.md 準拠、フィーチャ固有の罠)

## 重要な姿勢

- Sprint 1 で完成させた pure core / Svelte components / IPC adapter は **絶対に regression させない**
- Rust 実装は最小で OK
- Rust の error mapping は対応ドメイン feature の Failure 型と整合させる
- <feature>_state_changed event の payload は **必ず対応する DTO 型構造**を満たす
  (TS の types.ts と一致、serde rename_all = "camelCase" 必須)
- AppShell layout は DESIGN.md whisper border (#e9e9e7) + warm neutrals (#f7f7f5) 準拠
- AppShell の `<main>` 二重ネスト禁止 (FIND-S2-02 と同じ罠)
- 大規模なドメインロジック実装は避ける (Rust 側は thin wrapper)
- Cargo build が通るかを必ず確認
- Phase 1c は architect 事前承認 (gate 名は `1c-sprint-2`)
- proofObligations の id は ^PROP-\d{3,}$ パターン厳守 (英字混じり不可)
- Phase 3 adversary review は parent agent が後で別 invoke する
```

---

## 5. ui-editor 用の具体的指示 (即実行可能)

`docs/implement.md` L65-74 の通り、`ui-editor` には以下が必要:

### Rust commands (8 件)

`tauriEditorAdapter.ts` の `CMD` enum (`promptnotes/src/lib/editor/tauriEditorAdapter.ts:20-29`) と一致させる:

| TS adapter method | Rust command | 責務 |
|---|---|---|
| `dispatchEditNoteBody` | `edit_note_body(note_id, new_body, issued_at)` | body buffer 更新 (副作用なし、shell が timer 制御) |
| `dispatchTriggerIdleSave` | `trigger_idle_save(note_id, source, issued_at)` | `fs_write_file_atomic` で永続化 + `editing_state_changed` emit |
| `dispatchTriggerBlurSave` | `trigger_blur_save(note_id, source, issued_at)` | 同上 |
| `dispatchRetrySave` | `retry_save(note_id, issued_at)` | 失敗ノートを再保存 |
| `dispatchDiscardCurrentSession` | `discard_current_session(note_id, issued_at)` | 現在セッション破棄 + 新規開始 |
| `dispatchCancelSwitch` | `cancel_switch(note_id, issued_at)` | switching → editing 戻す |
| `dispatchCopyNoteBody` | `copy_note_body(note_id, body, issued_at)` | OS clipboard へコピー (`clipboard.write`) |
| `dispatchRequestNewNote` | `request_new_note(source, issued_at)` | **新規ノート ID 生成 + 空ファイル作成 + state emit** |

### 新規 fs commands

- `fs_write_file_atomic(path, contents)` — atomic 書き込み (tempfile + rename pattern)
- `clipboard_write(text)` — OS クリップボード (`tauri-plugin-clipboard-manager` クレートを利用)

### 依存ドメイン feature pipeline

`promptnotes/src/lib/domain/capture-auto-save/pipeline.ts` (TS) を Rust から呼ぶ必要は **無い** —
Rust は thin wrapper として fs IO のみ実行し、TS reducer がドメインロジックを駆動する。
Rust handlers は (a) fs 操作 + (b) `editing_state_changed` event emit のみ担当。

### 既知の Rust 側ノートメタデータ生成

- noteId = "<vault-path>/<UUID>.md" (絶対パス) で実装すれば `ui-feed-list-actions` の noteId 規約と整合
- frontmatter (`createdAt`, `updatedAt`, `tags`) の初期値は `feed_initial_state` と同じ helper を再利用 (`scan_vault_feed` の parse ロジックを抽出してモジュール化推奨)

### AppShell mount 確認

`+page.svelte` は既に `EditorPane` を `<EditorPane {adapter} {stateChannel} ...>` で mount 済み。
Sprint 2 では mount 自体ではなく **`adapter` が指す Rust commands が実装されるだけ**で動作開始する。
追加の `<aside>` / `<div>` は不要 (ui-feed-list-actions Sprint 2 で既に AppShell 配下に編集器も配置済み)。

---

## 6. ui-tag-chip / ui-filter-search 着手前のチェック

`docs/implement.md` の依存順:

```
ui-app-shell ──→ ui-editor ──→ ui-feed-list-actions ──→ ui-tag-chip ──→ ui-filter-search
```

**ui-editor の vertical slice が未達のままだと、ui-tag-chip / ui-filter-search も同じパターンで未達になる**。
ui-tag-chip 着手前に ui-editor sprint 2 を完成させること。

ui-tag-chip / ui-filter-search を最初から vertical slice で書くには、Phase 1a で:

1. `tauriTagChipAdapter.ts` / `tauriFilterAdapter.ts` の CMD enum を spec に列挙
2. 同名の `#[tauri::command]` handler を `src-tauri/src/<feature>.rs` に書く REQ を **Phase 1a の時点で含める**
3. AppShell mount を `+page.svelte` に追加する REQ を含める
4. `bun run tauri dev` で動作確認することを Phase 6 の必須 evidence にする

これらを Phase 1a の "Phase 2b で実装すべき配線レイヤ" に明示的に書くと、Sprint 1 で UI 層に偏った spec を書いてしまうリスクが減る。

---

## 7. 参照: ui-feed-list-actions Sprint 2 で得た教訓

- **FIND-S2-02 (HTML5 違反)**: AppShell の `<main>` 内に追加の `<main>` を入れると invalid。`<div>` を使う
- **FIND-S2-04 (tautological tests)**: vitest test で `expect(true).toBe(true)` のような実体のないアサーションを書かない
- **FIND-S2-05/06 (フィードが空になるバグ)**: Rust の event payload は **state mutation 前の最新状態** を carry すべき。`scan_vault_feed` のように re-scan して再構築する thin pattern を使う
- **FIND-S2-01 (note_id vs file_path 暗黙契約)**: 引数を 2 つに分ける (logical id と OS-level path)
- **proofObligations schema**: `id: PROP-\d{3,}` 厳守 (英字混じり不可)
- **gate 命名**: Sprint 2 のゲートは `1c-sprint-2`, `3-sprint-2`, `5-sprint-2`, `6-sprint-2` とする
- **Phase 6 で UI mount 確認**: 1659 件のテストでは検出できなかったバグ (`DeleteButtonClicked` が state を mutate しない) を Phase 6 の Playwright 確認で発見した。**`bun run tauri dev` または preview route で目視確認は必須**

---

## 8. 推奨着手順

1. `ui-editor` Sprint 2 を上の Builder Prompt Template で起票・実装 (1〜2h)
2. 完了後、`bun run tauri dev` で **Ctrl+N で新規ノート作成・本文編集・自動保存・コピー** が動作することを目視確認
3. PR を更新 (既存ブランチに重ねる) または新規 PR を起票
4. その後 `ui-tag-chip` / `ui-filter-search` を `docs/implement.md` の順で着手
   (Phase 1a で vertical slice 要件を明示することを忘れない)
