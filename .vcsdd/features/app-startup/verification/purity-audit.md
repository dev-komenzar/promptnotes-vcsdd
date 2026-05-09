# Phase 5 Purity Audit — app-startup

**Feature**: app-startup
**Phase**: 5 (Formal Hardening)
**Sprint**: 5 iteration 2
**Reference**: specs/verification-architecture.md (Revision 8)
**Audited at**: 2026-05-08T00:00:00Z

---

## Declared Boundaries

`specs/verification-architecture.md` Purity Boundary Map (Revision 8) の宣言:

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadVaultConfig` | Effectful shell | `settingsLoad()` + `statDir()` — 外部読み取り |
| Step 2 | `scanVault` | Effectful shell | `listMarkdown()` + `readFile()` per file; `parseMarkdownToBlocks` (pure) を per-file で呼び出すが scanVault 自体は effectful |
| Step 2 (parse, pure) | `parseMarkdownToBlocks` | **Pure core** | Markdown 文字列 → Block[] の純粋関数。Deterministic positional BlockId (`block-0..block-N-1`). Whitespace-only → Ok([]). paragraph('') を blank-line から生成しない (PROP-031). |
| Step 3 (ACL, pure) | `HydrateNote` / `hydrateNote` | **Pure core** | Pure ACL。parseMarkdownToBlocks + snapshot.frontmatter のみ使用。FrontmatterParser.parse を呼ばない。ブロックをフィルタ・再番号付けしない (PROP-027 rev8). |
| Inter-step (2→3) | `runAppStartupPipeline` orchestrator | Effectful shell | `Clock.now()` 1 回目 (VaultScanned emit 前) |
| Step 3 | `hydrateFeed` | **Pure core** | ポート依存なし、決定論的、`ScannedVault` のみ受け取る。PROP-032: hydrateNote が Err を返したらスローする (invariant violation) |
| Step 4 (time) | `Clock.now()` | Effectful shell | 2 回目かつ最終の `Clock.now()` 呼び出し |
| Step 4 (id-effectful) | `vault.allocateNoteId` | Effectful shell | Vault Aggregate 内部状態の読み取り |
| Step 4 (id-pure) | `nextAvailableNoteId` | **Pure core** | `(Timestamp, ReadonlySet<NoteId>) → NoteId` |
| Step 4 (compose) | `initializeCaptureSession` | Mixed | effectful `clockNow()` + effectful `allocateNoteId()` + pure helper |

**Formally verifiable core** (宣言): `hydrateFeed`, `nextAvailableNoteId`, `parseMarkdownToBlocks`, `hydrateNote`

---

## Observed Boundaries

### 静的解析 — `grep -nE "Date\.now\(\)"` (コメント外)

```
hydrate-feed.ts:                  0 件 (コメント内: "avoid Date.now() impurity" 参照)
hydrate-note.ts:                  0 件
load-vault-config.ts:             0 件 (コメント内: "never from Date.now() directly")
scan-vault.ts:                    0 件
pipeline.ts:                      0 件
initialize-capture.ts:            0 件 (コメント内: "Pure — no Date.now()")
capture-auto-save/parse-markdown-to-blocks.ts: 0 件
```

**結論**: 純粋コアモジュールでの `Date.now()` 直接呼び出し: 0 件

### 静的解析 — `grep -nE "process\.|require\(|eval\("` (全モジュール)

```
全 7 ファイル合計: 0 件
```

### モジュール別観察

**`parse-markdown-to-blocks.ts` (Step 2 parse — Pure core, NEW sprint 5)**:
- 宣言: Pure core (`parseMarkdownToBlocks` in Purity Boundary Map rev8)
- 観察:
  - `export function parseMarkdownToBlocks(markdown: string): Result<ReadonlyArray<Block>, BlockParseError>`
  - 単項関数 (arity=1)
  - `let blockIndex = 0` — per-call ローカルカウンター (グローバル状態なし、PROP-025 確認済み)
  - `if (markdown.trim() === "") return { ok: true, value: [] }` — whitespace-only → Ok([]) (PROP-031)
  - `line.trim() === ""` → blank line は `continue` でスキップ (paragraph('') 不生成、PROP-031)
  - 外部 I/O なし、`Date.now()` なし、グローバル変数アクセスなし
- **PROP-025 確認**: positional BlockId (`block-${blockIndex++}`) でカウンターは per-call リセット → 同一入力で同一出力
- **PROP-031 確認**: `trim() === ""` で blank/whitespace を除外 → `paragraph('')` 不生成
- 判定: **PASS** (宣言と一致)

**`hydrate-note.ts` (Step 3 ACL — Pure core, NEW sprint 5)**:
- 宣言: Pure core
- 観察:
  - `export function hydrateNote(snapshot: NoteFileSnapshot, blockParser: BlockParser = moduleParseMarkdownToBlocks): Result<Note, HydrationFailureReason>`
  - `hydrateNote.length === 1` (optional 第 2 引数はデフォルト付き、arity に含まれない)
  - `Date.now()` なし (Date.now スパイ: 0 calls confirmed by PROP-027 test)
  - `blockParser(snapshot.body as unknown as string)` のみ呼び出し (I/O なし)
  - `blocksResult.value.length === 0` → `Err('block-parse')` (PROP-029 / invariant 6)
  - `blocks = blocksResult.value` — pass-through (フィルタなし、BlockId 再割り当てなし — PROP-027 rev8)
  - `FrontmatterParser.parse` は呼ばない (snapshot.frontmatter を直接使用)
- **PROP-027 確認**: 同一 snapshot → 同一 Result (PROP-027 fast-check 100 runs PASS)
- 判定: **PASS** (宣言と一致)

**`hydrate-feed.ts` (Step 3 — Pure core)**:
- 宣言: Pure core。PROP-032: hydrateNote が Err を返したらスロー。
- 観察:
  - `export function hydrateFeed(scannedVault: ScannedVault): HydratedFeed` — 単項関数
  - `import { hydrateNote }` — pure function を呼び出すのみ
  - `const blockParser = scannedVault.parseMarkdownToBlocks` — PROP-030: Step 2 と同一関数参照
  - `if (!noteResult.ok) throw new Error(`hydrateNote-invariant-violation: ${snapshot.filePath}: ${noteResult.error}`)` — PROP-032 確認済み
  - `lastBuiltAt: { epochMillis: 0 }` — `Date.now()` 不使用
  - `buildTagInventory`: map + sort (純粋、副作用なし)
  - `corruptedFiles: step2CorruptedFiles` — Step-2 からのパススルー (Step-3 entries 追加なし)
- **PROP-032 確認**: スロー動作を 5 tests で検証 (PASS)
- 判定: **PASS** (宣言と一致)

**`nextAvailableNoteId` in `initialize-capture.ts` (Step 4 id-pure — Pure core)**:
- 宣言: Pure core
- 観察: 変更なし (sprint 4 baseline から同一)
- 判定: **PASS** (宣言と一致)

**`loadVaultConfig` (Step 1 — Effectful shell)**:
- 宣言: Effectful shell
- 観察: 変更なし (sprint 4 baseline から同一)
- 判定: **PASS** (宣言と一致)

**`scanVault` (Step 2 — Effectful shell)**:
- 宣言: Effectful shell。rev7/rev8: `parseMarkdownToBlocks` を ports 経由で受け取り、per-file で呼び出す。
- 観察:
  - `ports.parseMarkdownToBlocks` を per-file ループで呼び出し
  - `parseMarkdownToBlocks` Err → `CorruptedFile{failure:{kind:'hydrate',reason:'block-parse'}}` (PROP-026)
  - `parseMarkdownToBlocks` Ok([]) → `CorruptedFile{...reason:'block-parse'}` (PROP-029)
  - `Date.now()` なし、`Clock` 呼び出しなし
  - `hydrateNote` は呼ばない (REQ-002 rev7: HydrateNote は Step 3 のみ)
- 判定: **PASS** (宣言と一致)

**`runAppStartupPipeline` in `pipeline.ts` (Orchestrator — Effectful shell)**:
- 宣言: Effectful shell、`Clock.now()` ≤ 2 回
- 観察: 変更なし (sprint 4 baseline から同一; PROP-023 re-verified)
- 実測 `clockCallCount`: 2 (PROP-023 ハーネスで実測)
- 判定: **PASS** (宣言と一致)

**`initializeCaptureSession` (Step 4 — Mixed)**:
- 宣言: Mixed
- 観察: 変更なし (sprint 4 baseline から同一)
- 判定: **PASS** (宣言と一致)

---

## Summary

| モジュール | 宣言 | 観察 | 判定 |
|-----------|------|------|------|
| `parse-markdown-to-blocks.ts` | Pure core | per-call counter, no Date.now, no I/O, arity=1 | PASS |
| `hydrate-note.ts` | Pure core | no Date.now, no I/O, arity=1, pass-through (no filter) | PASS |
| `hydrate-feed.ts` | Pure core | no Date.now, no ports, arity=1, throws on Err | PASS |
| `nextAvailableNoteId` | Pure core | no Date.now, no ports, arity=2 | PASS |
| `loadVaultConfig` | Effectful shell | settingsLoad/statDir/clockNow/emit ポート使用 | PASS |
| `scanVault` | Effectful shell | listMarkdown/readFile/parseNote/parseMarkdownToBlocks ポート使用 | PASS |
| `pipeline.ts` orchestrator | Effectful shell | clockNow ≤ 2 回 (実測 2 回) | PASS |
| `initializeCaptureSession` | Mixed | clockNow 1 回 + allocateNoteId + emit | PASS |

**drift 検出**: なし

**全モジュール PASS** — rev8 宣言された純粋性境界と実装の間に乖離なし。

**Sprint 5 iteration 2 新規観察**:
- `parse-markdown-to-blocks.ts`: per-call ローカルカウンター設計により PROP-025 (purity) が成立。旧実装のモジュールレベルカウンター (非決定論的) は除去済み。
- `hydrate-note.ts`: rev8 pass-through 設計。`paragraph('')` フィルタ除去、BlockId 再割り当て除去。PROP-027 rev8 要件を満たす。
- `hydrate-feed.ts`: PROP-032 の invariant-violation throw が実装済み。Step-2 corruptedFiles が Step-3 エラーで汚染されないことを確認。

**残留リスク (Phase 6 前の要対応事項)**:
- なし。全 11 件の required proof obligation が proved 済み。
- FIND-033 (stages.ts 構造改善) は deferred (minor, non-blocking)。
- 非 required obligation (PROP-028, PROP-030 等) は lean モードで評価対象外。Phase 6 以降で必要に応じて対応。
