# Phase 5 Purity Audit — app-startup

**Feature**: app-startup
**Phase**: 5 (Formal Hardening)
**Reference**: specs/verification-architecture.md (Revision 5)
**Audited at**: 2026-04-30T20:30:00Z

---

## Declared Boundaries

`specs/verification-architecture.md` Purity Boundary Map (Revision 5) の宣言:

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadVaultConfig` | Effectful shell | `settingsLoad()` + `statDir()` — 外部読み取り |
| Step 2 | `scanVault` | Effectful shell | `listMarkdown()` + `readFile()` per file |
| Inter-step (2→3) | `runAppStartupPipeline` orchestrator | Effectful shell | `Clock.now()` 1 回目 (VaultScanned emit 前) |
| Step 3 | `hydrateFeed` | Pure core | ポート依存なし、決定論的、`ScannedVault` のみ受け取る |
| Step 4 (time) | `Clock.now()` | Effectful shell | 2 回目かつ最終の `Clock.now()` 呼び出し |
| Step 4 (id-effectful) | `vault.allocateNoteId` | Effectful shell | Vault Aggregate 内部状態の読み取り |
| Step 4 (id-pure) | `nextAvailableNoteId` | Pure core | `(Timestamp, ReadonlySet<NoteId>) → NoteId` |
| Step 4 (compose) | `initializeCaptureSession` | Mixed | effectful `clockNow()` + effectful `allocateNoteId()` + pure helper |

**Formally verifiable core** (宣言): `hydrateFeed` と `nextAvailableNoteId`

---

## Observed Boundaries

### 静的解析 — `grep -nE "Date\.now\(\)"` (コメント外)

```
hydrate-feed.ts:     0 件 (コメント内の言及 3 箇所は "使用しない" 旨の説明)
load-vault-config.ts: 0 件 (コメント内のみ)
initialize-capture.ts: 0 件 (コメント内のみ)
scan-vault.ts:        0 件
pipeline.ts:          0 件
```

**結論**: 純粋コアモジュールでの `Date.now()` 直接呼び出し: 0 件

### 静的解析 — `grep -nE "process\.|require\(|eval\("` (全モジュール)

```
全 5 ファイル合計: 0 件
```

### モジュール別観察

**`hydrate-feed.ts` (Step 3 — Pure core)**:
- 宣言: Pure core
- 観察:
  - import は型のみ (`type` import)、ポート引数なし
  - `hydrateFeed(scannedVault: ScannedVault): HydratedFeed` — 単項関数
  - `lastBuiltAt: { epochMillis: 0 }` — `Date.now()` 不使用、固定値
  - `sorted = [...snapshots].sort(...)` — 入力をコピーしてソート (ミュータブル操作なし)
- 判定: **PASS** (宣言と一致)

**`nextAvailableNoteId` in `initialize-capture.ts` (Step 4 id-pure — Pure core)**:
- 宣言: Pure core
- 観察:
  - `function nextAvailableNoteId(preferred: Timestamp, existingIds: ReadonlySet<NoteId>): NoteId`
  - ポートなし、`Date.now()` なし、グローバル状態アクセスなし
  - `new Date(epochMillis)` を使用しているが引数の `epochMillis` から生成 (決定論的)
- 判定: **PASS** (宣言と一致)

**`loadVaultConfig` (Step 1 — Effectful shell)**:
- 宣言: Effectful shell
- 観察:
  - ポート引数: `settingsLoad`, `statDir`, `clockNow`, `emit`
  - `clockNow()` は `vaultPath === null` 分岐でのみ呼び出される (FIND-009 準拠)
  - `Date.now()` 直接呼び出しなし
- 判定: **PASS** (宣言と一致)

**`scanVault` (Step 2 — Effectful shell)**:
- 宣言: Effectful shell
- 観察:
  - ポート引数: `listMarkdown`, `readFile`, `parseNote`
  - `for...of` ループで各ファイルを順次処理 (並列 I/O なし)
  - `Date.now()` なし、`Clock` 呼び出しなし
- 判定: **PASS** (宣言と一致)

**`runAppStartupPipeline` in `pipeline.ts` (Orchestrator — Effectful shell)**:
- 宣言: Effectful shell、`Clock.now()` ≤ 2 回 (PROP-023)
- 観察:
  - `const occurredOn = ports.clockNow()` — pipeline.ts:93 (inter-step 2→3)
  - Step 4 で `initializeCaptureSession` 経由で `clockNow()` 1 回
  - `hydrateFeed(scannedVault)` — ポートを渡さない純粋呼び出し
  - `clockNow` は `hydrateFeed` には渡していない (PROP-023 確認済み)
- 実測 `clockCallCount`: 2 (PROP-023 ハーネスで実測)
- 判定: **PASS** (宣言と一致)

**`initializeCaptureSession` (Step 4 — Mixed)**:
- 宣言: Mixed (effectful `clockNow` + effectful `allocateNoteId` + pure helper)
- 観察:
  - `ports.clockNow()` — 1 回呼び出し
  - `ports.allocateNoteId(now)` — 1 回呼び出し (Aggregate 状態読み取り、effectful)
  - `nextAvailableNoteId` は `allocateNoteId` の実装内部で使用 (ドメイン層から直接は呼ばれない)
  - `ports.noteCreate(noteId, now)` — FIND-002 準拠、戻り値は未利用 (intent: event 発行用)
  - `ports.emit(...)` — 2 回 (NewNoteAutoCreated, EditorFocusedOnNewNote)
- 判定: **PASS** (宣言と一致)

---

## Summary

| モジュール | 宣言 | 観察 | 判定 |
|-----------|------|------|------|
| `hydrate-feed.ts` | Pure core | Date.now なし、ポートなし、arity=1 | PASS |
| `nextAvailableNoteId` | Pure core | Date.now なし、ポートなし、arity=2 | PASS |
| `loadVaultConfig` | Effectful shell | settingsLoad/statDir/clockNow/emit ポート使用 | PASS |
| `scanVault` | Effectful shell | listMarkdown/readFile/parseNote ポート使用 | PASS |
| `pipeline.ts` orchestrator | Effectful shell | clockNow ≤ 2 回 (実測 2 回) | PASS |
| `initializeCaptureSession` | Mixed | clockNow 1 回 + allocateNoteId + emit | PASS |

**drift 検出**: なし

**全モジュール PASS** — 宣言された純粋性境界と実装の間に乖離なし。

**残留リスク (Phase 6 前の要対応事項)**:
- なし。全 required proof obligation が proved 済み。
- 非 required obligation (PROP-005〜PROP-024 のうち required: false のもの) は
  現フェーズでは評価対象外。Phase 6 以降のスプリントで必要に応じて対応。

**FIND-008 (Rust path)**: Rust 側の `note_id.rs` に `proptest` を用いた property test
(prop003_proptest_uniqueness, prop022_proptest_determinism) が実装済みかつ pass 済み。
Option B (追加なし) で resolved。
