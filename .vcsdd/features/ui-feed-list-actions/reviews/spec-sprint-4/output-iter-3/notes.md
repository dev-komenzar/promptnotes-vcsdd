# Adversary Review Notes — ui-feed-list-actions Sprint 4 Phase 1c iter-3

## Iter-2 Findings Resolution (3/3)

**FIND-S4-SPEC-iter2-001 (high, spec_fidelity, RESOLVED)**
- behavioral-spec.md:716-754 で `parse_markdown_to_blocks` 契約に non-empty 不変条件を導入。
- 空文字列 body 入力でも空 paragraph 1 件 (`[{ id, Paragraph, "" }]`) を返すことを契約として明文化。
- ケース (3) (`Some(vec![])`) を「契約上到達不能 (forbidden by parse_markdown_to_blocks contract)」と明示 (line 745, 747-754)。
- Wire shape は absent / non-empty array の 2 通りに収束、TS 受信側の空配列処理 AC は不要と spec が確定 (line 754)。
- iter-2 remediation 案 (b) 採用相当の解決。

**FIND-S4-SPEC-iter2-002 (medium, verification_readiness, RESOLVED)**
- verification-architecture.md:640 で PROP-FEED-S4-016 の Required 列が `false` → `true` に変更。
- Sprint 4 ゲート (§7) で parity verification が強制される。
- スコープは基本ケース 1 ペアスナップショットに限定 (line 640: "Sprint 4 ゲートでは基本ケーススナップショット 1 ペアの PASS をもって Phase 5 gate を満たすとする")。

**FIND-S4-SPEC-iter2-003 (medium, verification_readiness, RESOLVED)**
- §5 Tooling Map の関連行に Sprint 4 amendment 注追加 (line 215, 228)。
- §5 末尾に Sprint 4 PROP 16 件の正規テストファイル一覧 table 新設 (line 257-279)。
- §6 Coverage Matrix に REQ-FEED-024(S4)/025/026/027 行が新規追加 (line 319-325)。

## Builder Self-Review Independent Verification

- **TS 側型レベル non-empty 強制不在**: `docs/domain/code/ts/src/shared/blocks.ts` の `ParseMarkdownToBlocks` interface は `Result<ReadonlyArray<Block>, BlockParseError>` を返し、型レベルでは `[]` を許容する。spec はこれを「runtime contract invariant」として扱い、`docs/domain/aggregates.md §1` Note 不変条件 (line 723) を根拠とする。型レベルでなく契約レベルでの保証である点は spec で明示されており、Sprint 4 のスコープ内で許容範囲。
- **PROP-FEED-S4-016 1 ペアスコープ**: 基本ケース (`# heading\n\nparagraph`) のみであり、code block / nested list / escaped backslash 等 edge case の divergence は検知不能。これは Sprint 5 fast-check 拡張への deferral として spec で明示されており、Sprint 4 ゲートとしては許容範囲 (Required: true により最低限の parity gate は確立)。

## New Concerns (None)

- 仕様文言が grep-able assertion として固定されている (rg / grep コマンド文字列が AC に直接記載)。
- 既存 Sprint 8 REQ-IPC-001..020 / DTO 5-arm 正規形との連続性確認: `EditingSessionStateDto::Editing` の field 集合 (status, currentNoteId, focusedBlockId, isDirty, isNoteEmpty, lastSaveResult, blocks?) が REQ-IPC-004 と一致。
- Sprint 1〜3 オリジナルの `pendingNextNoteId` 記述は §3/§4/§9/§9b に保持されているが、各所に "Sprint 4 amendment" 注が付与されており、Sprint 4 deprecation note (§13 line 642-647) で読み替え方針が明示されているため、二重定義による曖昧性は解消されている。

## Verdict

**PASS** — 両 dimension PASS、新規 finding 0 件。Sprint 4 Phase 2a (Red phase) への移行を承認。

Phase 2a 実装者は §13 PROP-FEED-S4-001..016 (Required: true 13 件) を Tier 別に failing test として実装すること。
