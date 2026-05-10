# Sprint 5 Phase 3 Adversarial Review — Notes

**Feature**: ui-feed-list-actions
**Sprint**: 5
**Iteration**: 1 / 5
**Overall**: FAIL

## Headline

Sprint 5's deliverable — embedding `BlockElement[]` inside `FeedRow` for in-place note editing — **is not actually wired up in production code**. The new modules (`editingSessionChannel.ts`, `createBlockEditorAdapter.ts`) exist and pass their own unit/integration tests in isolation, and `FeedRow.svelte` correctly accepts the new props. But `+page.svelte` never calls `subscribeEditingSessionState(...)` or `createBlockEditorAdapter()`, and `FeedList.svelte` never accepts or forwards `editingSessionState` / `blockEditorAdapter`. The result is that, in the running application, FeedRow always receives `blockEditorAdapter=null`, the mount gate `{#if shouldMountBlocks && blockEditorAdapter}` is permanently false, and **no BlockElement will ever render**.

This is not a subtle correctness bug. It is a complete absence of the integration glue between three new pieces of code. The Sprint 5 user-visible scenario ("click a past note → an empty paragraph appears → the user can type") cannot occur in any production build.

The reason this slipped past the contract gates is that **every Sprint 5 DOM "integration" test mounts `FeedRow.svelte` directly with hand-crafted props**, bypassing the wiring layer. The single test that loads `+page.svelte` source (`main-route.dom.vitest.ts`) only checks for *absence* of forbidden identifiers, never positive presence of `subscribeEditingSessionState(` or `createBlockEditorAdapter(`. The grep audit script likewise inspects the channel and adapter for shape/boundary properties, not whether anyone calls them.

## Dimension verdicts

- **spec_fidelity**: FAIL — REQ-FEED-029 ("+page.svelte または FeedList.svelte が subscribeEditingSessionState(...) を 1 回 mount") and REQ-FEED-030 ("BlockEditorAdapter の生成は +page.svelte または FeedList で 1 回行い、FeedRow に props として渡す") are both unfulfilled. Verification arch §14 lines 754 + 757 are explicit about this responsibility.
- **edge_case_coverage**: FAIL — PROP-FEED-S5-019 (EC-FEED-019 double-click race) doesn't perform two clicks; it pre-sets switching state and asserts a single suppressed click, which is the existing Sprint-1 PROP-FEED-013. PROP-FEED-S5-018 (EC-FEED-018) verifies row-level remount but not the upstream cache continuity the spec describes.
- **implementation_correctness**: FAIL — In *isolation*, every new module is correct: the channel listener is synchronous and INBOUND-only; the factory wraps all 16 commands with `issuedAt`; the FeedRow `$effect` correctly handles all four restart conditions for `fallbackAppliedFor` (including the iter2-005 undefined→non-empty→undefined cycle). But correctness in isolation does not produce a working product when the modules are never composed.
- **structural_integrity**: FAIL — Beyond the wiring gap, the spec itself is internally inconsistent: REQ-FEED-031 step 5 specifies `dispatchInsertBlockAtBeginning({ noteId, newBlock: { id, block_type, content }, issuedAt })` (carrying the client UUID) while REQ-FEED-030's command-mapping table specifies `{ noteId, type, content, issuedAt }` (no `id`). The implementation followed the type contract (REQ-FEED-030), which means the client-generated UUID is not transmitted to Rust. When Group B handlers eventually exist, the first server emit will carry a Rust-allocated id different from the client UUID, desynchronizing focus/selection state.
- **verification_readiness**: FAIL — All "integration" tests bypass the production composition path. No test would fail if `FeedList`/`+page.svelte` deleted the wiring entirely. Phase 5 (formal hardening) cannot meaningfully verify a system whose top-level composition is unverified.

## What is solid (positive evidence)

- `feedRowPredicates.ts:needsEmptyParagraphFallback` — correct, total, fast-check covers null/undefined/[]/non-empty equivalence classes (≥200 runs implicit).
- `editingSessionChannel.ts` — single `listen('editing_session_state_changed', ...)` call, INBOUND-only confirmed by grep, handler synchronous (no await/.then/setTimeout/queueMicrotask in callback body), 5-arm passthrough verified at module level for Idle/Editing/Switching/SaveFailed.
- `createBlockEditorAdapter.ts` — exactly 16 `invoke()` calls, command-name set matches REQ-FEED-030 mapping, every dispatch site explicitly destructures and re-passes `issuedAt`. Tier-0 type assertion verifies assignability to `BlockEditorAdapter`.
- `FeedRow.svelte` $effect logic — correctly handles all four restart conditions for `fallbackAppliedFor` (null state, noteId switch, prior non-empty cycle, idempotent re-emit). `lastBlocksWasNonEmpty` flag correctly invalidates the cached fallback when blocks transition non-empty→absent.
- Sprint-4 emit-order baseline — `git diff vcsdd/ui-feed-list-actions/sprint-4-baseline..HEAD` for editor.rs/feed.rs is clean for emit lines (PROP-FEED-S5-013).
- Forbidden-identifier audit — `EditorPanel`, `editorStateChannel`, `tauriEditorAdapter`, `editorReducer`, `editorPredicates`, `EditorViewState`, `EditorAction`, `EditorCommand`, `EditorIpcAdapter` all 0-hit in production code. `src/lib/editor/` directory absent on filesystem.

## Routing recommendation

Two findings (FIND-S5-PHASE3-001, FIND-S5-PHASE3-002) block convergence.

- **FIND-S5-PHASE3-001 → Phase 2b**: Add the 3-line wiring to `+page.svelte` (or FeedList): instantiate `createBlockEditorAdapter()`, call `subscribeEditingSessionState(...)` in `$effect` with cleanup, hold the latest payload in `$state`, thread both through to FeedList → FeedRow. Estimated effort: 30 lines across two files.
- **FIND-S5-PHASE3-002 → Phase 2a**: Add at least one integration test that mounts `+page.svelte` (or FeedList), drives a mocked `editing_session_state_changed` emit, and asserts a `data-testid="block-element"` appears in the row matching `editingNoteId`. Equivalently extend `sprint-5-grep-audit.sh` with positive-presence assertions for `subscribeEditingSessionState(` and `createBlockEditorAdapter(` in production source.
- **FIND-S5-PHASE3-003 → Phase 2a**: Rewrite PROP-FEED-S5-019 to actually perform two clicks with a state transition between them.
- **FIND-S5-PHASE3-004 → Phase 1c**: Reconcile REQ-FEED-031 step 5 with REQ-FEED-030's command-mapping table (either drop the `newBlock: { id, ... }` shape from REQ-FEED-031 or extend the BlockEditorAdapter to carry `newBlock.id`).

The first two are mandatory for Sprint 5 convergence. The third improves coverage but does not block. The fourth is a spec hygiene issue that should be addressed before Group B Rust handlers are implemented in a future sprint, but does not block Sprint 5 itself.
