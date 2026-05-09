---
coherence:
  node_id: "contract:ui-block-editor-sprint-3"
  type: contract
  name: "ui-block-editor Sprint 3 — secondary primitive DOM tests"
  depends_on:
    - id: "contract:ui-block-editor-sprint-2"
      relation: derives_from
---

# Sprint 3 Contract: SlashMenu / BlockDragHandle / SaveFailureBanner DOM tests

**Feature**: `ui-block-editor`
**Sprint**: 3 / 4
**Phase**: 2a (Red) → 2b (Green) → 2c (Refactor)
**Mode**: strict

## In-scope PROP IDs

| PROP | REQ | 内容 |
|------|-----|------|
| PROP-BE-031 | REQ-BE-011 | SlashMenu 9 種列挙 + filter |
| PROP-BE-032 | REQ-BE-012 | SlashMenu キーボード操作 |
| PROP-BE-033 | REQ-BE-013 | BlockDragHandle dragstart |
| PROP-BE-034 | REQ-BE-014 | BlockDragHandle dragend で state リセット |
| PROP-BE-035 | REQ-BE-015 | SaveFailureBanner 表示条件 |
| PROP-BE-036 | REQ-BE-016 | SaveFailureBanner 3 アクションボタン |

## Phase 2a Red expectations

新規ファイル:
- `src/lib/block-editor/__tests__/dom/slash-menu.dom.vitest.ts`
- `src/lib/block-editor/__tests__/dom/block-drag-handle.dom.vitest.ts`
- `src/lib/block-editor/__tests__/dom/save-failure-banner.dom.vitest.ts`

## Phase 2b Green expectations

`BlockDragHandle.svelte` の `onMoveBlock` prop を **optional** に変更（REQ-BE-014b / FIND-BE-1C-007）。

その他のコンポーネント（SlashMenu / SaveFailureBanner）は spec rev2 と既存実装が整合しており追加実装不要の見込み。

## Sprint exit criteria

- 全 PROP-BE-031..036 のテストが pass する
- BlockDragHandle.svelte の `onMoveBlock` prop が optional
- `bun run check` で BlockDragHandle / SlashMenu / SaveFailureBanner の type error ゼロ
