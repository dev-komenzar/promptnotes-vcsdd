# Sprint 4 Phase 1c iter-2 Adversary Notes

## iter-1 11 findings の解消状況: 11/11 完全解消

- spec_fidelity dimension (FIND-S4-SPEC-001..006): 6/6 解消
  - 3 ケース固定表 (line 731-742)、`parse_markdown_to_blocks` Rust 実装義務と fallback 経路 (line 716-720)、§9 / §9b / EC-FEED-013 への Sprint 4 amendment 追記、out-of-scope deferrals 明示。
- verification_readiness dimension (FIND-S4-SPEC-007..011): 5/5 解消
  - 旧シグネチャ廃止 grep を `rg` 正規表現で厳密化、PROP-FEED-S4-016 新設 (parser parity)、grep audit scope を `promptnotes/src/` / `promptnotes/src-tauri/src/` 全体に拡張、PROP-FEED-007a 系の deprecation note 追加、PROP-FEED-S4-012/013/014 を AppHandle 不要 unit test に明示変更。

## 新規 finding: 3 件

- FIND-S4-SPEC-iter2-001 (high, spec_fidelity): ケース (1) `blocks` absent と ケース (3) `blocks: []` の wire 差を TS 受信側が semantic-equivalent として扱うことを binary AC で確約していない。EditorPane rehydration の 5-arm 一般文 (line 684) では不足。
- FIND-S4-SPEC-iter2-002 (medium, verification_readiness): PROP-FEED-S4-016 が Required: false のため、iter-1 FIND-S4-SPEC-008 (high) が要求した Rust↔TS parser parity ゲートが Sprint 4 では未強制。
- FIND-S4-SPEC-iter2-003 (medium, verification_readiness): §5 Tooling Map / §6 Coverage Matrix が Sprint 4 PROP を反映しておらず、Phase 2a 実装者が新規 property test の配置先を一覧から特定できない。

## PASS/FAIL 理由

iter-1 の 11 件は全て解消したが、iter-2 で新たに 3 件 (high 1, medium 2) を発見したため両 dimension とも FAIL、overall FAIL。FIND-S4-SPEC-iter2-001 は wire 契約の semantic ambiguity という high-impact spec gap で、Phase 2a 着手前に解消すべき。FIND-S4-SPEC-iter2-002 はゲート設定の弱体化、iter2-003 は Tooling Map の機械的更新漏れ。次フェーズは iter-3 spec 改訂を推奨。
