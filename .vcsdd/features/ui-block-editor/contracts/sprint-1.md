---
coherence:
  node_id: "contract:ui-block-editor-sprint-1"
  type: contract
  name: "ui-block-editor Sprint 1 — pure modules tests (blockPredicates + debounceSchedule)"
  depends_on:
    - id: "design:ui-block-editor-verification"
      relation: derives_from
    - id: "req:ui-block-editor"
      relation: derives_from
---

# Sprint 1 Contract: pure modules tests

**Feature**: `ui-block-editor`
**Sprint**: 1 / 4
**Phase**: 2a (Red) → 2b (Green) → 2c (Refactor)
**Mode**: strict
**Created**: 2026-05-09

## Scope

Pure module 群のテスト整備。`blockPredicates.ts` と `debounceSchedule.ts` の Tier 1 (example-based) と Tier 2 (fast-check property) を対象とする。

## In-scope PROP IDs

| PROP | 対象 | Tier |
|------|-----|------|
| PROP-BE-001 | `bannerMessageFor` totality | 2 |
| PROP-BE-002 | `bannerMessageFor` purity | 2 |
| PROP-BE-003 | `splitOrInsert` 単純判別 | 2 |
| PROP-BE-004 | `splitOrInsert` purity | 2 |
| PROP-BE-005 | `classifyMarkdownPrefix` 優先順位 | 2 |
| PROP-BE-006 | `classifyMarkdownPrefix` divider 完全一致 | 2 |
| PROP-BE-007 | `classifyMarkdownPrefix` non-prefix 安全性 | 2 |
| PROP-BE-008 | `classifyMarkdownPrefix` purity | 2 |
| PROP-BE-009 | `classifyBackspaceAtZero` totality | 2 |
| PROP-BE-010 | `classifyBackspaceAtZero` 分岐 | 2 |
| PROP-BE-011 | `classifySource` bijective | 2 |
| PROP-BE-012 | `IDLE_SAVE_DEBOUNCE_MS` constant | 2 |
| PROP-BE-013 | `nextFireAt` 加算性 | 2 |
| PROP-BE-014 | `computeNextFireAt` saved suppression | 2 |
| PROP-BE-015 | `computeNextFireAt` debounce boundary | 2 |
| PROP-BE-016 | `computeNextFireAt` purity | 2 |
| PROP-BE-017 | `shouldFireIdleSave` empty short-circuit | 2 |
| PROP-BE-018 | `shouldFireIdleSave` saved suppression | 2 |
| PROP-BE-019 | `shouldFireIdleSave` debounce boundary | 2 |
| PROP-BE-020 | `shouldFireIdleSave` order independence | 2 |

## Out-of-scope

- Svelte component DOM tests（Sprint 2/3）
- Tier 0 type assertions（Sprint 4）
- Tier 5 source-grep gates（Sprint 4）

## Phase 2a Red expectations

新規テストファイル:
- `src/lib/block-editor/__tests__/blockPredicates.test.ts` (Tier 1, bun:test) ← 既存削除済み・新規作成
- `src/lib/block-editor/__tests__/prop/blockPredicates.prop.test.ts` (Tier 2, fast-check) ← 既存削除済み・新規作成
- `src/lib/block-editor/__tests__/debounceSchedule.test.ts` (renamed REQ-EDIT → REQ-BE, 既存上書き)
- `src/lib/block-editor/__tests__/prop/debounceSchedule.prop.test.ts` (renamed, 既存上書き)

すべての新規テストは `REQ-BE-NNN` / `PROP-BE-NNN` 命名で書く。Tier 3 rule に従い `expect(x).toEqual(<concrete>)` または `expect(x).toBe(<concrete>)` で exact-match のみ使う。

## Phase 2b Green expectations

`blockPredicates.ts` および `debounceSchedule.ts` は spec rev2 のシグネチャと挙動に既に整合している（実装は既存）。Sprint 1 では追加の実装は不要の見込み。Red phase で fail するテストが見つかった場合のみ Green を行う。

## Phase 2c Refactor expectations

- `blockPredicates.ts` / `debounceSchedule.ts` の docstring 内 `REQ-EDIT-NNN` / `PROP-EDIT-NNN` を `REQ-BE-NNN` / `PROP-BE-NNN` に置換（NFR-BE-007 / PROP-BE-044）

## Sprint exit criteria

- 全 PROP-BE-001..020 に対応するテストが存在する（test description 内 / コメント内のいずれかで PROP ID を参照）
- すべてのテストが `bun test src/lib/block-editor/__tests__/blockPredicates*.ts src/lib/block-editor/__tests__/debounceSchedule*.ts` で pass する
- `bun run check` で `src/lib/block-editor/` 配下の type error がゼロ
- coverage（`@vitest/coverage-v8` で blockPredicates.ts / debounceSchedule.ts）が branch ≥ 95%
- PROP-BE-041 / PROP-BE-044 の grep ゲートが pass する
