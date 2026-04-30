# Phase 5 Verification Report — app-startup

**Feature**: app-startup
**Phase**: 5 (Formal Hardening)
**Mode**: lean
**Language**: typescript (with auxiliary Rust at promptnotes/src-tauri/)
**Verified at**: 2026-04-30T20:30:00Z

---

## Proof Obligations

| ID | Tier | Required | Status | Tool | Harness | Result |
|----|------|----------|--------|------|---------|--------|
| PROP-001 | 1 | true | proved | fast-check (numRuns=1000) | proof-harnesses/prop-001-hydrate-feed-purity.harness.ts | fuzz-results/prop-001.log |
| PROP-002 | 1 | true | proved | fast-check (numRuns=1000) | proof-harnesses/prop-002-hydrate-feed-excludes-corrupted.harness.ts | fuzz-results/prop-002.log |
| PROP-003 | 1 | true | proved | fast-check (numRuns=1000) | proof-harnesses/prop-003-next-available-note-id.harness.ts | fuzz-results/prop-003.log |
| PROP-004 | 0 | true | proved | TypeScript type exhaustiveness | proof-harnesses/prop-004-app-startup-error-exhaustive.harness.ts | fuzz-results/prop-004.log |
| PROP-023 | 1 | true | proved | fast-check + spy (numRuns=100) | proof-harnesses/prop-023-clock-budget.harness.ts | fuzz-results/prop-023.log |

---

## Harness Strategy

ハーネスは `promptnotes/src/lib/domain/__tests__/app-startup/__verify__/` 配下に
`*.harness.test.ts` として配置し、`bun test` で実行する方式を採用した。
理由: `$lib` エイリアスおよび `promptnotes-domain-types` パス解決が `promptnotes/`
ディレクトリの bun モジュール設定に依存しているため、外部スクリプトからの直接実行より
bun test の方が最小の設定変更で動作するため。

`.vcsdd/.../verification/proof-harnesses/` には同一ファイルのコピーを保管する。

---

## Results

### PROP-001: hydrateFeed purity

- **Tier**: 1
- **Tool**: fast-check v4.7.0
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/__verify__/prop-001-hydrate-feed-purity.harness.test.ts`
- **numRuns**: 1000
- **Result**: VERIFIED
- **Output**: 3 pass / 0 fail
- **Property checked**: `∀ (snapshots[0..8], corruptedFiles[0..4]), hydrateFeed(input) deepEquals hydrateFeed(input)`
  - noteRefs 順序、tagInventory、corruptedFiles 件数、lastBuiltAt の全フィールドが一致
  - Date.now スパイ: 呼び出し回数 = 0 (purity 確認済み)
  - hydrateFeed.length === 1 (ScannedVault のみの単項関数)

### PROP-002: hydrateFeed excludes corrupted

- **Tier**: 1
- **Tool**: fast-check v4.7.0
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/__verify__/prop-002-hydrate-feed-excludes-corrupted.harness.test.ts`
- **numRuns**: 1000
- **Result**: VERIFIED
- **Output**: 4 pass / 0 fail
- **Property checked**: `∀ (snapshots[0..8], corruptedFiles[0..4]), noteRefs ⊆ inputSnapshotNoteIds`
  - noteRefs.length === snapshots.length (破損ファイルは計上されない)
  - 全破損 Vault → noteRefs 空 (確認済み)
  - 破損ファイルのタグは TagInventory に反映されない (確認済み)

### PROP-003: nextAvailableNoteId uniqueness

- **Tier**: 1
- **Tool**: fast-check v4.7.0
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/__verify__/prop-003-next-available-note-id.harness.test.ts`
- **numRuns**: 1000
- **Result**: VERIFIED
- **Output**: 5 pass / 0 fail
- **Property checked**: Sprint-4 load-bearing パターン採用
  - `base = nextAvailableNoteId(preferred, new Set())` を先取得
  - `existingIds = {base} ∪ {base-0..5}` で多段衝突を強制実行
  - `result ∉ existingIds` を検証 (1000 runs)
  - base 衝突 → `-1` 付与、`-1` も衝突 → `-2` 付与 (REQ-011 AC 確認済み)
  - nextAvailableNoteId.length === 2 (純粋関数)

### PROP-004: AppStartupError exhaustiveness

- **Tier**: 0 (TypeScript type-level)
- **Tool**: TypeScript type exhaustiveness (never branch in switch)
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/__verify__/prop-004-app-startup-error-exhaustive.harness.test.ts`
- **Result**: VERIFIED
- **Output**: 5 pass / 0 fail
- **Compile-time proof**:
  - `assertAppStartupErrorExhaustive` 関数の switch default で `const _: never = e` が通過
  - `IsNever<Exclude<AppStartupErrorKind, 'config' | 'scan'>> = true` (追加バリアントなし)
  - 第 3 バリアント追加時のコンパイルエラーが Tier-0 Red シグナルとして機能することを確認
- **Runtime proof**: 全 4 バリアント (`config/unconfigured`, `config/path-not-found`, `config/permission-denied`, `scan/list-failed`) が正しくハンドルされることを実行確認

### PROP-023: Clock.now call budget

- **Tier**: 1
- **Tool**: fast-check asyncProperty + spy
- **Command**: `cd promptnotes && bun test src/lib/domain/__tests__/app-startup/__verify__/prop-023-clock-budget.harness.test.ts`
- **numRuns**: 100 (非同期プロパティのため)
- **Result**: VERIFIED
- **Output**: 5 pass / 0 fail
- **Properties checked**:
  - `PROP-023a`: `∀ epoch_ms, clockCallCount ∈ [1, 2]` (asyncProperty, 100 runs)
  - 具体的パイプライン実行: clockCallCount = 2 (pipeline.ts:93 + initialize-capture.ts:52)
  - `PROP-023b` 型レベル: `_HydrateFeedParams extends [ScannedVault] ? true : false = true`
  - `PROP-023b` 型レベル: `IsNever<Extract<params[number], {epochMillis: number}>> = true`
  - `PROP-023c`: Date.now スパイ — hydrateFeed 実行中の呼び出し回数 = 0

---

## Tooling

| Tool | Used | Result |
|------|------|--------|
| fast-check v4.7.0 | PROP-001/002/003/023 | PASS (1000/1000/1000/100 runs) |
| TypeScript type checker | PROP-004 | PASS (compile-time exhaustiveness) |
| Stryker (mutation) | 試行済み | SKIPPED — bun runner プラグイン未インストール (lean モード任意) |
| Rust proptest (cargo test) | FIND-008 / note_id.rs | PASS (7 tests, 2 proptest runs) |
| semgrep | なし | NOT INSTALLED |
| bun pm scan | なし | 未設定 (bunfig.toml に scanner 指定なし) |
| npm audit | なし | lockfile 不在 (bun lockfile のみ) |
| cargo audit | なし | NOT INSTALLED |

---

## FIND-008 Disposition

**決定: Option B — 既存 Rust proptest で十分、追加 dev-dep 不要**

調査結果:
- `promptnotes/src-tauri/src/domain/vault/note_id.rs` に `proptest` を使用した
  2 件のプロパティテスト (`prop003_proptest_uniqueness`, `prop022_proptest_determinism`) が
  既に実装済みであることを確認した。
- `Cargo.toml` に `proptest = "1"` が dev-dependency として記載済み。
- `cargo test` 実行結果: 7 tests passed (うち 2 proptest runs)。
- TypeScript 側の `nextAvailableNoteId` がランタイムの実装パスであり、
  Rust 側は参照実装 (`docs/domain/code/rust/`) として位置づけられている。

Option A (新たな Rust property test の追加) は不要。Rust proptest は既に存在し
かつ pass している。FIND-008 は resolved として扱う。

Cargo test 出力:
```
test domain::vault::note_id::tests::prop003_proptest_uniqueness ... ok
test domain::vault::note_id::tests::prop022_proptest_determinism ... ok
test result: ok. 7 passed; 0 failed; 0 ignored
```

---

## Regression Check

- `bun test` (全テスト): 137 pass / 0 fail (115 original + 22 new harness tests)
- `bunx svelte-check`: 315 files / 0 errors / 0 warnings
- `cargo test --manifest-path src-tauri/Cargo.toml`: 7 pass / 0 fail

---

## Summary

- **Required obligations**: 5
- **Proved**: 5 (PROP-001, PROP-002, PROP-003, PROP-004, PROP-023)
- **Failed**: 0
- **Skipped**: 0

全 5 件の required proof obligation が proved 状態に達した。
Phase 6 収束判定の前提条件 (required obligations are all proved) を満たす。

残留リスク:
- mutation testing (Stryker) は lean モードで任意のためスキップ。fast-check
  numRuns=1000 の property tests が実質的なカバレッジを提供しており、
  高リスク変異体は property 違反として検出されると判断する。
- FIND-008: Rust proptest 済みのため追加作業不要。
