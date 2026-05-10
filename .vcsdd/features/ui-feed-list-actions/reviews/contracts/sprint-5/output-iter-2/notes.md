# Sprint 5 strict-mode contract review — round 2 (negotiationRound: 2)

Contract digest: `e70b64601a0213c82254ea1e5be6d1f25451f0d6a003e101afe0051710b021bc`
Iteration: 3 (negotiationRound + 1)
Verdict: **PASS** (all 5 dimensions PASS, 0 unresolved round-1 findings, 0 new issues)

## Verification of round-1 → round-2 fix claims

### FIND-S5-CONTRACT-001 — RESOLVED

**Claim:** `feed-list-editing-channel.dom.vitest.ts` strengthened with downstream-spy protocol + 4 arm-coverage tests.

**Verification:**
- File line 63-101: PROP-FEED-S5-005 main protocol test now uses `downstreamSpy = vi.fn(() => { expect(observedSnapshot).not.toBeNull(); expect(observedSnapshot.currentNoteId).toBe('noteX'); })`. Assertion runs INSIDE the spy callback BEFORE any delegated work (line 80-82). Emit pair is synchronous (line 86-97, no `await` between emit and `downstreamSpy()` invocation).
- File line 105-197: 4 arm-coverage tests for Idle / Editing / Switching / SaveFailed.
- CRIT-201 description (sprint-5.md line 25-27) honestly narrows "5-arm" to "4 explicit arms + Saving via Editing inheritance" — Saving has structurally identical fields to Editing (only status discriminator differs), so the narrowing is defensible.

**Caveat (acknowledged but not load-bearing):** The original spec text PROP-FEED-S5-005(b) called for literal `mockEmit('feed_state_changed', feedPayload)`. The round-2 implementation replaces this with a hand-rolled `downstreamSpy()` that simulates the downstream consumer. The *substance* (downstream sees state already updated) is verified mechanically; the literal cross-event emit is not. The contract description has been updated to reflect this honestly: "downstream spy assertion of synchronous state update before delegate". Acceptable.

### FIND-S5-CONTRACT-002 — RESOLVED

**Claim:** PROP-FEED-S5-011 scenario (d) replaced with substantive test using `FeedRowSprint5Wrapper.svelte`.

**Verification:**
- File line 287-337: Test now uses `FeedRowSprint5Wrapper` to mount FeedRow with reactive `editingSessionState` prop. Sequence:
  1. Mount with `blocks=undefined` → record `firstId` (line 306-307: matches UUID v4)
  2. `setters.setEditingSessionState(blocks=[{id:'server-block'}])` → record `interimId === 'server-block'` (line 323-324)
  3. `setters.setEditingSessionState(blocks=undefined)` → record `secondId`; assert `secondId !== firstId` (line 332) AND `dispatchInsertBlockAtBeginning` called 2 times (line 334).
- Confirmed regression-protection: removing FeedRow.svelte:272 (`if (fallbackAppliedFor) fallbackAppliedFor = null;`) would break this test (`secondId` would equal `firstId` and call count would be 1).

### FIND-S5-CONTRACT-003 — RESOLVED with disclosure

**Claim:** PROP-FEED-S5-018 rewritten to verify mount→unmount→remount preserves block-element rendering.

**Verification:**
- File line 309-403: Test now models filter exclusion via explicit unmount/remount cycle. (1) mount → block-element count = SAMPLE_BLOCKS.length; (2) unmount → 0; (3) remount with same state → SAMPLE_BLOCKS.length. Second test (line 369-402) guards against spurious dispatches during unmount.
- CRIT-207 description (sprint-5.md line 55) now honestly says "modeling FeedList unmounting the row when filter excludes". The integration-level filter→unmount path is structurally covered by Svelte's `{#each viewState.visibleNoteIds}` semantics (Sprint 1-4 baseline tests already exercise filter-induced row visibility).
- Trade-off accepted: row-level test cannot directly exercise FeedList's filter logic, but the cache-restore semantic (the load-bearing half of EC-FEED-018) is verified.

### FIND-S5-CONTRACT-004 — RESOLVED

**Claim:** `main-route.dom.vitest.ts` extended + added to manifest.

**Verification:**
- Manifest line 23: `promptnotes/src/routes/__tests__/main-route.dom.vitest.ts` present.
- File line 214-226: Test "PROP-FEED-S5-002 (source structure): height: 100vh + FeedList mount + no EditorPanel mount" exists and asserts:
  - `<main class="feed-main"` regex match
  - `height: 100vh` regex match
  - Contains `<FeedList`
  - Does NOT contain `<EditorPanel`, `editor-main`, or `feed-sidebar`
- CRIT-200 passThreshold (sprint-5.md line 22) explicitly references the test by name.

### FIND-S5-CONTRACT-005 — RESOLVED via composite

Resolved as a downstream consequence of FIND-001 + FIND-002 fixes. Contract criteria CRIT-201 / CRIT-203 now have passThresholds that genuinely entail their spec promises (no hidden tautology, no over-claim).

## New issues introduced in round-2 changes

None identified.

### Considered and dismissed:

- **FeedRowSprint5Wrapper.svelte hacky window-key setter pattern**: Acceptable because (a) it's confined to `__tests__/dom/`, (b) header documents test-only intent (line 11), (c) `$effect` cleanup function (line 63) prevents window-key leakage across tests, (d) per-mount unique key avoids cross-test interference.
- **Saving arm explicitly absent from PROP-FEED-S5-005 test set**: Acceptable because (a) the contract description openly discloses "Saving arm shape verified through Editing inheritance", (b) the wire shape Saving and Editing are structurally identical (only status discriminator differs), (c) the channel passes `state` through unchanged (editingSessionChannel.ts line 39-45), so any arm with the right shape will pass through correctly.
- **CRIT-205 dimension classification (verification_readiness vs structural_integrity)**: Minor concern carried over from round 1; not load-bearing because the passThreshold is mechanically evaluable regardless of which dimension bucket it sits in. Not worth blocking on.

## Convergence assessment

This is the FINAL allowed negotiation round. All 5 round-1 findings have substantive resolution backed by test-file evidence. The contract's passThresholds now align with the underlying REQ-FEED-028..033 + EC-FEED-016/018/019/020 promises. Phase 3 (adversarial code review) and Phase 5 (formal hardening) entry gates are unblocked.

Recommend Builder proceed to Phase 2a (Red phase).
