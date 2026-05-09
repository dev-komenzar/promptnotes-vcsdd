---
coherence:
  node_id: "contract:ui-block-editor-sprint-4"
  type: contract
  name: "ui-block-editor Sprint 4 — Tier 0 / Tier 5 gates + Phase 2c rename"
  depends_on:
    - id: "contract:ui-block-editor-sprint-3"
      relation: derives_from
---

# Sprint 4 Contract: Tier 0 + Tier 5 gates + Phase 2c REQ-EDIT rename

**Feature**: `ui-block-editor`
**Sprint**: 4 / 4
**Phase**: 2c (Refactor) primary
**Mode**: strict

## In-scope PROP IDs

| PROP | Tier | 内容 |
|------|------|------|
| PROP-BE-037 | 0 | `BlockEditorAdapter` shape — `_AssertXxxShape` 型アサーション |
| PROP-BE-040 | 5 | 旧 EditorPane 型残留チェック（grep） |
| PROP-BE-041 | 5 | Pure module 禁止 API ゼロ（grep） |
| PROP-BE-042 | 5 | 旧 `src/lib/editor/` ディレクトリ不存在 |
| PROP-BE-043 | 5 | `2000` リテラル禁止（debounceSchedule.ts 以外） |
| PROP-BE-044 | 5 | Phase 2c 後の `REQ-EDIT` / `PROP-EDIT` 残留チェック |
| PROP-BE-045 | 5 | PROP-BE ID 連続性 |

## Phase 2c rename (FIND-BE-1C-016 / NFR-BE-007)

`blockPredicates.ts` および `debounceSchedule.ts` の docstring 内に残る `REQ-EDIT-NNN` / `PROP-EDIT-NNN` を `REQ-BE-NNN` / `PROP-BE-NNN` に置換する。マッピングは behavioral-spec.md の Source-of-Truth Mapping 表に基づく。

| 旧 ID | 新 ID |
|-------|-------|
| REQ-EDIT-005, REQ-EDIT-032, PROP-EDIT-006 (canCopy) | 削除済（pre-work） |
| REQ-EDIT-025, REQ-EDIT-026, PROP-EDIT-005, PROP-EDIT-042 (bannerMessageFor) | REQ-BE-017 / PROP-BE-001, PROP-BE-002 |
| REQ-EDIT-037, PROP-EDIT-002 (classifySource) | REQ-BE-021 / PROP-BE-011 |
| REQ-EDIT-006, REQ-EDIT-007, PROP-EDIT-001, EC-EDIT-012 (splitOrInsert) | REQ-BE-018 / PROP-BE-003, PROP-BE-004 |
| REQ-EDIT-010, PROP-EDIT-010, EC-EDIT-013 (classifyMarkdownPrefix) | REQ-BE-019 / PROP-BE-005..008 |
| REQ-EDIT-008, PROP-EDIT-011, EC-EDIT-011 (classifyBackspaceAtZero) | REQ-BE-020 / PROP-BE-009, PROP-BE-010 |
| REQ-EDIT-012 (IDLE_SAVE_DEBOUNCE_MS) | REQ-BE-022 / PROP-BE-012 |
| PROP-EDIT-003, PROP-EDIT-004, CRIT-705 (debounce family) | PROP-BE-013..020 |

## Tier 0 assertions

`types.ts` に `_AssertEditBlockContentShape` / `_AssertSplitBlockShape` / `_AssertCopyNoteBodyShape` の 3 件を追加。

## Tier 5 grep gates

`src/lib/block-editor/__tests__/sprint-4.gates.test.ts` を新規作成し、`bun test` で実行可能な assertion 群を定義する。

## Sprint exit criteria

- 全 PROP-BE-037, 040..045 のテストが pass する
- `bun test` 全体（Sprint 1..4 の合計）で 0 fail
- `bun run check` で block-editor 関連 type error ゼロ
- 47 / 47 proof obligations が status='green-tested'
