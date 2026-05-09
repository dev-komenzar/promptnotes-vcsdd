# Sprint 4 Phase 3 Adversarial Review — Notes

## 総評

Sprint 4 の block-aware migration は **spec 上の core invariant をすべて遵守** している。
Rust 側の `compose_state_for_select_past_note` は Option<Vec<DtoBlock>> シグネチャに正しく
移行され、3 ケース固定表 (REQ-FEED-025) のすべてに対応する。`parse_markdown_to_blocks` は
non-empty 不変条件を二段階で守る (early-return at editor.rs:357-363、最終 guard at 532-538)。
TS 側の `pendingNextFocus: { noteId, blockId } | null` mirror は feedReducer / FeedRow /
types.ts に一貫して反映され、PROP-FEED-S4-006 の biconditional は fast-check 200 runs で genuine。

Wire shape は spec 完全準拠:
- `EditingSubDto.pending_next_focus: Option<PendingNextFocusDto>` には `skip_serializing_if`
  が付かず、None で `null` を emit (REQ-FEED-027 EC 準拠)
- `Editing.blocks` は `skip_serializing_if = "Option::is_none"` で None のとき key absent
  (REQ-FEED-024 ケース 1 / EC-FEED-016 準拠)
- `body` フィールドは payload から削除済み (prop_s4_012 で実機検証)

## PASS dimensions (4/5)

- **spec_fidelity**: 3 ケース固定表との完全一致、parse_markdown_to_blocks の non-empty
  契約、5-arm DTO Editing arm 正規形遵守。
- **implementation_correctness**: branch coverage は parse_markdown_to_blocks 全 9 block
  type に行き届く。BlockParseError 時の None fallback (feed.rs:257) は spec 準拠。
- **purity_boundary**: feedReducer.ts の pendingNextFocus mirror は純粋なフィールドコピー
  のみ。canonical purity-audit grep 維持。
- **wire_compatibility**: Rust serde 出力と TS DTO 型は keyset・nullable・rename 規則が一致。

## FAIL dimension: test_quality

3 件 (medium 2 + low 1)。すべて test 側の問題で実装本体の欠陥ではない。

1. **FIND-S4-IMPL-001 (medium)**: PROP-FEED-S4-016 Required:true だが TS 側
   `parserParity.test.ts` が存在しない。spec が要求する Rust + vitest 両方の snapshot pair
   のうち TS 側が欠落。
2. **FIND-S4-IMPL-002 (medium)**: select_past_note のいわゆる「integration test」3 件は実
   handler を呼ばず helper 合成を再実装するだけ。Sprint 3 で既知 (FIND-S3-101) だが
   Sprint 4 が同じ pattern を踏襲。EC-FEED-017 emit 順序は依然 code-review 任せ。
3. **FIND-S4-IMPL-003 (low)**: spec が指定する canonical fixture
   `'# heading\n\nparagraph'` に対する snapshot 比較が無い。6 ケースの個別 sniff のみ。

## Phase 5 ルーティング推奨

`test_quality` 1 軸 FAIL のため overall FAIL だが、いずれも spec/impl ではなくテスト側
の補強。Phase 4 で `/vcsdd-feedback` 経由で 2b へルーティングし、parserParity.test.ts
新規作成 + canonical fixture snapshot 追加で解消可能。
