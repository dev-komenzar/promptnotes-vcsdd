# ui-feed-list-actions Sprint 4 Phase 1c Adversary Review — Summary

## Verdict: FAIL

両軸 (spec_fidelity / verification_readiness) ともに FAIL。Sprint 4
amendment 自体は方向として正しい (block-aware 移行の意図、`pendingNextFocus`
拡張、`compose_state_for_select_past_note` の block-aware シグネチャ) が、
Sprint 8 IPC 正規形との整合と既存 §4 PROP table・§9 / §9b 型定義の整合
が中途半端で、Phase 2a に進むには規範レベルの矛盾が多すぎる。

## 最優先で直すべき箇所

1. **FIND-S4-SPEC-001 (critical)**: `blocks: None` vs `Some(blocks)` の
   契約矛盾。EC-FEED-016 / PROP-FEED-S4-014 が要求する `blocks フィールド
   absent` と REQ-FEED-025 / PROP-FEED-S4-001 が要求する `blocks: Some(blocks)`
   が両立できない。`compose_state_for_select_past_note` の責務分担を一意に
   固定し、note 未存在時のコードパスを spec で明示する。これを直さないと
   実装者が任意決定し、Sprint 8 で確立した REQ-IPC-011 と再分裂する
   wire-incompatibility リスクが顕在化する。

2. **FIND-S4-SPEC-002 (critical)**: Rust 側 `parse_markdown_to_blocks` の
   実装義務とエラー経路が未定義。現状 `feed.rs:253-260` は body 文字列を
   そのまま compose に渡しているだけで、Sprint 4 が要求する block 化が
   Rust 側にまだ無い。失敗時挙動 (`BlockParseError`) も未規定で、Phase 2a で
   どう test を書けばよいかが決まらない。

3. **FIND-S4-SPEC-003 / 010 (high / medium)**: verification-architecture.md
   §9 (FeedViewState) / §9b (FeedDomainSnapshot) / §4 PROP-FEED-007a が
   旧 `pendingNextNoteId` のままで、Sprint 4 amendment と二重定義状態。
   spec の Acceptance Criteria が要求する『pendingNextNoteId が存在しない』
   検証と verification-architecture の正典が真っ向から食い違う。

## block-aware migration としての完成度

block-migration-spec-impact.md の推奨アクション 1〜6 のうち:
- #1 (Source of truth 追加) — DONE
- #2 (REQ-FEED-001..009 の body / pendingNext 改訂) — DONE (REQ-FEED-002 / 009)
- #3 (REQ-FEED-024 / EC-FEED-016 / EC-FEED-017 の block-based 書き直し)
  — PARTIAL (FIND-S4-SPEC-001 / 006 で矛盾が残る)
- #4 (`bodyPreviewLines` 入力源明示) — DONE
- #5 (`apply-filter-or-search` / `tag-chip-update` payload 整合決定)
  — UNDONE (FIND-S4-SPEC-005)
- #6 (Sprint 3 cargo integration tests の block 化指針) — PARTIAL
  (FIND-S4-SPEC-011 で tier 矛盾)

block-aware migration としての完成度は **約 65%**。critical 級が 2 件
あるため Phase 2a に進めない。

## 推奨ルート

Phase 1a/1b へ feedback ルーティングし、上記 critical 2 件を解消後、
verification-architecture.md §9/§9b/§4 を Sprint 4 amendment 矢印付きで
書き換える。同時に EC-FEED-013 / PROP-FEED-007a / PROP-FEED-023 を
Sprint 4 で deprecate or replace する明示文言を追加。Rust 側の
`parse_markdown_to_blocks` 実装は新 PROP-FEED-S4-016 として TS 規範
実装との parity property test を追加 (FIND-S4-SPEC-008)。
