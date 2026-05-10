# Sprint 5 Phase 1c Iteration 3 — Adversarial Spec Review (FINAL iteration)

**Reviewer**: VCSDD Adversary (fresh context)
**Date**: 2026-05-10
**Outcome**: PASS (spec_fidelity: PASS, verification_readiness: PASS)

## Summary

All 16 iter-1 findings remain resolved (carried from iter-2 status). All 7 iter-2 findings are resolved by iter-3 corrections. **No new blocking issues introduced.** The Sprint 5 spec is ready to proceed to Phase 2a (Red phase).

## Iter-2 finding resolution audit

### spec_fidelity (4 findings — all resolved)

#### FIND-S5-SPEC-iter2-001 — `issuedAt` missing in command-mapping → RESOLVED
- behavioral-spec.md L1071-1090: every row of REQ-FEED-030 §Adapter command-mapping table now lists `issuedAt` in the payload column.
- L1056 explicitly mandates: "すべての dispatch payload には `issuedAt: string` (ISO 8601, `nowIso()` から取得) を含める".
- Cross-check with ui-block-editor REQ-BE-002b L219 (`adapter.dispatchFocusBlock({ noteId, blockId: block.id, issuedAt: issuedAt() })`) and REQ-BE-003 L237 (`adapter.dispatchEditBlockContent({ noteId, blockId, content, issuedAt: issuedAt() })`) confirms end-to-end alignment.
- PROP-FEED-S5-017 (L721) condition (3) requires `issuedAt` in source ≥ 16 occurrences, providing executable verification.

#### FIND-S5-SPEC-iter2-003 (CRITICAL) — Cross-feature Rust handler contract → RESOLVED
- REQ-FEED-030 introduces a new "Sprint 5 Rust handler scope split" subsection (L1058-1094) with explicit Group A (7 existing) / Group B (9 not-yet-implemented) tables.
- Group A: `dispatchTriggerIdleSave`, `dispatchTriggerBlurSave`, `dispatchRetrySave`, `dispatchDiscardCurrentSession`, `dispatchCancelSwitch`, `dispatchCopyNoteBody`, `dispatchRequestNewNote` (existing in editor.rs Sprint 2).
- Group B: `dispatchFocusBlock`, `dispatchEditBlockContent`, `dispatchInsertBlockAfter`, `dispatchInsertBlockAtBeginning`, `dispatchRemoveBlock`, `dispatchMergeBlocks`, `dispatchSplitBlock`, `dispatchChangeBlockType`, `dispatchMoveBlock` (Rust handlers absent, will be implemented in a future sprint).
- REQ-FEED-031 EARS L1117 now mandates "**best-effort で** ... 試行" + "(4) どちらの dispatch が reject しても fallback BlockElement の表示は維持しなければならない".
- REQ-FEED-031 design rationale L1123-1127 honestly admits: "**Sprint 5 では Group B の Rust handler が未実装**のため両 dispatch とも reject されることを許容する" and explicitly states the Sprint 5 known constraint that block edits will not persist to Rust ("文字は **client-side の BlockElement state にしか保持されない**").
- PROP-FEED-S5-022 (L726) provides DOM-level verification of best-effort acceptance: with all Group B dispatches mocked to reject, the test asserts (a) BlockElement remains in DOM, (b) contenteditable text input still updates client-side `textContent`, (c) console.warn is invoked (positive evidence of attempt+reject), (d) focus visual still works.
- Migration doc L18 (`Rust バックエンドの変更 → UI spec 確定後に別タスクで扱う`) supports this scope deferral.

#### FIND-S5-SPEC-iter2-005 — UUID reuse on undefined→non-empty→undefined → RESOLVED
- REQ-FEED-031 fallback restart condition L1149 adds case (iii): "**直前のレンダリング cycle で `editingSessionState.blocks` が non-empty だった** ... かつ **現サイクルで再び absent/empty に戻った**".
- Per-row `lastBlocksWasNonEmpty: boolean` $state is introduced at L1158 to track the previous-cycle non-empty observation.
- L1153 mandates `fallbackAppliedFor` reset to `null` when non-empty arrives: "**`fallbackAppliedFor` を `null` にリセット** (FIND-S5-SPEC-iter2-005 解消: 次に再び absent が来たら restart 条件 (iii) で新 UUID を発番できるよう invalidate)". This makes condition (i) also handle the regression case as a defense-in-depth.
- PROP-FEED-S5-011 scenario (d) (L715) explicitly tests undefined→non-empty→undefined sequence with the assertion "**2 回目 fallback の UUID は 1 回目と異なる**".

#### FIND-S5-SPEC-iter2-007 — Truth table row 2 parenthetical contradiction → RESOLVED
- L1034 row 2 cell now reads: `| 'idle' | true | 0 | 表示 |` — parenthetical `(editingNoteId が null でも row は描画される)` removed.
- L1038 adds defensive-test note clarifying that row 2 is "**architecturally 到達不能**" under feedReducer mirror invariant (REQ-FEED-009), and the AC requires defensive 0-count assert via synthetic viewState injection limited to FeedRow crash-safety verification.

### verification_readiness (3 findings — all resolved)

#### FIND-S5-SPEC-iter2-002 — PROP-FEED-S5-013 unverified baseline tag → RESOLVED
- Tag `vcsdd/ui-feed-list-actions/sprint-4-baseline` is verified to exist in this worktree as a loose ref pointing to commit `d30ab135d5dba9faff00a9bab49c97c6b705ae24` (read directly from `.git/refs/tags/...`).
- This commit SHA (`d30ab13` short-form) matches PROP-FEED-S5-013 L717: "**Sprint 4 完了時タグ `vcsdd/ui-feed-list-actions/sprint-4-baseline`** (= commit `d30ab13`、`vcsdd(complete): ui-feed-list-actions sprint-4 convergence PASS — block migration` を指す不変参照)".
- The placeholder `<sprint-4-baseline-tag-or-rev>` is no longer present in PROP-FEED-S5-013; the executable command pins the exact tag name.
- PROP-FEED-S5-013 includes precondition `git rev-parse --verify vcsdd/ui-feed-list-actions/sprint-4-baseline` so Phase 5 will fail loudly if the tag is missing or moved.

#### FIND-S5-SPEC-iter2-004 — Orphan dangling row → RESOLVED
- verification-architecture.md ends at L787 with: "> **FIND-S5-SPEC-iter2-004 解消**: 旧版に存在した orphan dangling table row ... は §13 Sprint 4 の coverage matrix に既出のため、§14 末尾からは削除した".
- The orphan `| REQ-FEED-024 (S4) | PROP-FEED-S4-012... |` row is gone. §14 ends cleanly at L787 with the resolution note.

#### FIND-S5-SPEC-iter2-006 — PROP-FEED-S5-005 spy mechanism unspecified → RESOLVED
- PROP-FEED-S5-005 L709 now specifies: "test は `vi.spyOn(feedReducerModule, 'feedReducer')` で `feedReducer` を spy し、spy callback 内で **delegate before** に `expect(...)` を assert する".
- The spy mechanism, the assertion location (BEFORE delegate), and the helper (`window.__editingSessionStateForTest` written by a test fixture without affecting production code) are all concrete and implementable.
- The supplementary check (d) (PROP-FEED-S5-012 grep audit for `await`/`.then(`/`setTimeout(`/`queueMicrotask(`) provides defense-in-depth.

## Iter-3 net new content (new PROP & expanded scenarios)

- **PROP-FEED-S5-022** (L726): Best-effort dispatch acceptance — concretely testable via mock adapter rejecting all 9 Group B methods + asserting BlockElement remains, textContent updates client-side, console.warn fires, focus visual works. New test file `feed-row-best-effort-dispatch.dom.vitest.ts` registered in Test Strategy (L742) and Coverage Matrix (L767, L768).
- **PROP-FEED-S5-011** (L715): expanded from 4 to 5 scenarios — (a) basic dispatch order + reject acceptance, (b) シナリオ A (2 consecutive undefined, UUID identical), (c) シナリオ B (note switch, new UUID), (d) シナリオ C (undefined→non-empty→undefined, new UUID via restart condition iii), (e) シナリオ D (only non-empty, 0 dispatch attempts).

## Adversarial probes performed

The following failure modes were actively searched and not found:

- **test_quality**: PROP-FEED-S5-005 spy mechanism is concrete; no tautological mocks. PROP-FEED-S5-022 includes positive evidence (`vi.spyOn(console, 'warn')` to confirm dispatch was attempted before reject).
- **test_coverage**: PROP-FEED-S5-011 covers all 5 fallback scenarios; PROP-FEED-S5-006 covers all 4 truth-table cells; PROP-FEED-S5-022 covers Group B reject behavior.
- **requirement_mismatch**: REQ-FEED-030 §Adapter command-mapping table aligns end-to-end with ui-block-editor REQ-BE-026/002b/003 for `issuedAt`.
- **security_surface**: No new injection or auth surfaces introduced; UUID generation uses `crypto.randomUUID()` (cryptographically random) per L1130.
- **spec_gap**: Group A/B Rust handler split is explicitly documented; Sprint 5 known constraint (no Rust persist for block edits) is explicit at L1127.
- **purity_boundary**: feedRowPredicates.ts `needsEmptyParagraphFallback` is pure (pattern-matched against canonical purity grep at §1); UUID generation, dispatch, and fallback state are all in effectful shell (`FeedRow.svelte` $effect) per L1160.
- **verification_tool_mismatch**: PROP-FEED-S5-013's git diff against the now-existing baseline tag is mechanically resolvable; PROP-FEED-S5-016 tsc strict / PROP-FEED-S5-017 grep+diff / PROP-FEED-S5-022 vitest+jsdom are all standard tools used elsewhere in the repo.

## Minor observations (non-blocking)

The following were observed but do not warrant findings:

1. **AC vs PROP scenario letter offset**: REQ-FEED-031 AC L1172 lists "Idempotency 強化テスト 4 シナリオ (a)/(b)/(c)/(d)", while PROP-FEED-S5-011 L715 lists 5 scenarios "(a)/(b)/(c)/(d)/(e)". The first AC bullet about basic order (L1167-1171) corresponds to PROP scenario (a), so the AC's "(a)" maps to PROP's "(b)" etc. This is a labeling inconsistency but the substantive scenario set is equivalent (5 total). Phase 2a writers reading PROP-FEED-S5-011 will implement 5 scenarios; reading AC alone they will implement 1+4=5. No coverage gap.

2. **`lastBlocksWasNonEmpty` lifecycle not explicit**: L1158 introduces the per-row state but does not explicitly say it's reset on `editingNoteId` change. However, L1160 mentions it alongside `fallbackAppliedFor` (which IS reset on noteId change at L1152), and PROP-FEED-S5-011 scenarios (b) and (c) constrain the observable behavior unambiguously, so Phase 2a implementers are guided by the test AC even if the state-management text is terse.

3. **`window.__editingSessionStateForTest` fixture interpretation**: PROP-FEED-S5-005's test fixture mechanism could be interpreted as either a test wrapper or a production code hook, but the explicit clause "production code には影響しない" disambiguates toward the wrapper interpretation, which is the standard test-instrumentation pattern.

None of these rise to spec_gap severity given the iter-3 strengthened ACs and PROP scenarios.

## Sprint 5 known constraint disclosure

The spec honestly documents that Sprint 5 ships UI-only — block edits to past notes will NOT persist to Rust during Sprint 5 (L1127, L1179). This is a deliberate scope decision aligned with the migration doc and is properly disclosed:
- REQ-FEED-030 Group A/B split table (L1062-1065): explicit "Sprint 5 動作: invoke 試行 → reject" for Group B.
- REQ-FEED-031 design rationale (L1123-1127): "block 編集の永続化は別 sprint の責務".
- REQ-FEED-031 Edge Cases (L1179): "Sprint 6 以降で Rust handler が実装されると Rust が `blocks` 付き次の `editing_session_state_changed` を emit するようになり、サーバ提供 `blocks` で表示が同期される".

This is a product/architecture trade-off, not a spec defect. The spec's role is to be honest about what it specifies; whether the user-visible regression is acceptable is a separate convergence concern (Phase 6).

## Recommendation

**Spec PASSES Phase 1c iteration 3.** Proceed to Phase 2a (Red phase test generation) for Sprint 5. No iter-3 findings filed; no escalation to architect needed.
