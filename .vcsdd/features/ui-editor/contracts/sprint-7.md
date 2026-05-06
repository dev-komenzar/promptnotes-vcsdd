---
sprintNumber: 7
feature: ui-editor
status: draft
negotiationRound: 0
scope: >
  Full rewrite of the ui-editor feature for the block-based domain model. All Sprint 1–6
  textarea-based files under promptnotes/src/lib/editor/ are replaced. Pure-tier modules
  (editorPredicates.ts, editorReducer.ts, debounceSchedule.ts) are rewritten to expose the
  block-model predicate set (splitOrInsert, classifyMarkdownPrefix, classifyBackspaceAtZero,
  canCopy, bannerMessageFor, classifySource), the 17-variant EditorCommand union, and the
  block-aware mirror reducer. Five Svelte 5 components are authored from scratch (EditorPanel,
  BlockElement, SlashMenu, BlockDragHandle, SaveFailureBanner) using runes only. Two IPC
  adapters are rewritten: tauriEditorAdapter.ts (OUTBOUND — 16 dispatchXxx methods) and
  editorStateChannel.ts (INBOUND — subscribeToState only). The full test suite is rewritten:
  pure unit tests, fast-check property tests, and vitest+jsdom integration tests. The legacy
  EditNoteBody command name and any EditNoteBody/edit-note-body symbol are purged. Rust backend
  handlers (src-tauri/src/editor.rs) are adjusted only to the extent required to keep the build
  green; concrete new #[tauri::command] handlers belong to a follow-up feature.
criteria:
  - id: CRIT-700
    dimension: spec_fidelity
    description: >
      REQ-EDIT-001..038 test coverage completeness — every requirement ID appears in at least
      one test file in the suite. Pure-tier REQs (PROP-EDIT-001..015, PROP-EDIT-040, PROP-EDIT-042)
      are covered by *.test.ts or *.property.test.ts. Integration-tier REQs
      (PROP-EDIT-016..039, PROP-EDIT-041, PROP-EDIT-043..051) are covered by *.dom.vitest.ts.
      Legacy EditNoteBody / edit-note-body symbol is absent from all editor source and test files.
    weight: 0.16
    passThreshold: >
      grep -r "REQ-EDIT-" promptnotes/src/lib/editor/__tests__/ produces at least one match
      for each of REQ-EDIT-001 through REQ-EDIT-038; grep -r "EditNoteBody\|edit-note-body"
      promptnotes/src/lib/editor/ returns zero hits; tsc --noEmit --strict
      --noUncheckedIndexedAccess inside promptnotes/ exits 0.

  - id: CRIT-701
    dimension: spec_fidelity
    description: >
      EC-EDIT-001..014 integration test coverage — all 14 edge cases listed in
      verification-architecture.md §6 have corresponding test assertions in the integration
      tier. Specifically: EC-EDIT-001 (continuous burst debounce), EC-EDIT-002 (blur while
      saving/switching), EC-EDIT-003 (save-failed continued input), EC-EDIT-004 (discard
      in-flight), EC-EDIT-005 (switching lock then unblock), EC-EDIT-006 (same-note refocus),
      EC-EDIT-007 (copy disable with isNoteEmpty), EC-EDIT-008 (RequestNewNote from save-failed),
      EC-EDIT-009 (OS sleep/resume timer mock), EC-EDIT-010 (New Note enabled in saving),
      EC-EDIT-011 (first-block backspace noop), EC-EDIT-012 (enter-at-end vs mid-block),
      EC-EDIT-013 (divider exact-match rule), EC-EDIT-014 (Cancel restores priorFocusedBlockId).
    weight: 0.09
    passThreshold: >
      Each EC-EDIT-001..014 ID appears in at least one test assertion comment or description
      string inside promptnotes/src/lib/editor/__tests__/; grep -rn "EC-EDIT-0[0-1][0-9]"
      promptnotes/src/lib/editor/__tests__/ produces 14 distinct ID matches; bun run test:dom
      inside promptnotes/ exits 0 after Green phase.

  - id: CRIT-702
    dimension: spec_fidelity
    description: >
      EditorCommand 17-variant union (§10) — the TypeScript type in types.ts exactly matches
      the canonical list in verification-architecture.md §10: focus-block, edit-block-content,
      insert-block-after, insert-block-at-beginning, remove-block, merge-blocks, split-block,
      change-block-type, move-block, cancel-idle-timer, trigger-idle-save, trigger-blur-save,
      retry-save, discard-current-session, cancel-switch, copy-note-body, request-new-note
      (16 IPC variants + 1 local-effect variant). No legacy edit-note-body or request-new-note
      9-variant Sprint-1 union variant is present.
    weight: 0.05
    passThreshold: >
      grep -c "kind:" promptnotes/src/lib/editor/types.ts outputs exactly 17 (one per variant
      arm in the EditorCommand union); grep "edit-note-body" promptnotes/src/lib/editor/types.ts
      returns zero hits; tsc --noEmit --strict --noUncheckedIndexedAccess exits 0;
      editorReducer.property.test.ts property 'reducer-totality' confirms commands[].kind
      membership in the 17-variant set via Set assertion over >=100 fast-check runs.

  - id: CRIT-703
    dimension: implementation_correctness
    description: >
      Pure-tier Tier 2 PROP-EDIT-001..011 and PROP-EDIT-040 pass — all 12 required fast-check
      property tests pass with >=100 runs each. PROP-EDIT-001 (splitOrInsert totality),
      PROP-EDIT-002 (save-source equality), PROP-EDIT-003 (debounce semantics),
      PROP-EDIT-004 (blur-cancels-idle), PROP-EDIT-005 (bannerMessageFor exhaustiveness over
      5 FsError variants), PROP-EDIT-006 (canCopy parity with isNoteEmpty),
      PROP-EDIT-007 (reducer totality — 17-variant EditorCommand), PROP-EDIT-008 (reducer purity),
      PROP-EDIT-010 (classifyMarkdownPrefix totality including divider exact-match rule),
      PROP-EDIT-011 (classifyBackspaceAtZero coverage), PROP-EDIT-040 (per-variant
      DomainSnapshotReceived mirroring with idle-default fields). PROP-EDIT-009 is subsumed
      by PROP-EDIT-002 (no separate test required).
    weight: 0.14
    passThreshold: >
      bun run test inside promptnotes/ exits 0; editorPredicates.property.test.ts properties
      'split-or-insert-totality', 'banner-exhaustiveness', 'copy-enable-parity',
      'markdown-prefix-totality', 'backspace-classifier-coverage' each pass >=100 fast-check
      runs; editorReducer.property.test.ts properties 'source-pass-through', 'reducer-totality',
      'reducer-purity', 'snapshot-per-variant-mirroring' each pass >=100 fast-check runs;
      debounceSchedule.property.test.ts properties 'debounce-semantics', 'blur-cancels-idle'
      each pass >=100 fast-check runs.

  - id: CRIT-704
    dimension: implementation_correctness
    description: >
      Tier 1 PROP-EDIT-012..015 and PROP-EDIT-042 pass — five deterministic unit tests:
      PROP-EDIT-012 (NoteFileSaved emits cancel-idle-timer + isDirty=false),
      PROP-EDIT-013 (EditorBlurredAllBlocks in saving/switching returns no trigger-blur-save),
      PROP-EDIT-014 (focusedBlockId mirroring: editing arm uses focusedBlockId; save-failed arm
      uses priorFocusedBlockId), PROP-EDIT-015 (same-note BlockFocused keeps status=editing and
      emits no save/cancel-timer commands), PROP-EDIT-042 (bannerMessageFor exact Japanese
      strings for all 5 FsError variants; null for both validation variants).
    weight: 0.10
    passThreshold: >
      editorReducer.test.ts assertions 'NoteFileSaved sets isDirty=false and emits
      cancel-idle-timer', 'EditorBlurredAllBlocks while saving returns commands=[]',
      'EditorBlurredAllBlocks while switching returns commands=[]', 'same-note BlockFocused
      keeps editing status with no save commands', 'DomainSnapshotReceived editing arm mirrors
      focusedBlockId', 'DomainSnapshotReceived save-failed arm copies priorFocusedBlockId to
      focusedBlockId' all pass 100%; editorPredicates.test.ts exact-string assertions for
      bannerMessageFor permission/disk-full/lock/not-found/unknown and null-returning
      validation variants pass 100%; bun run test exits 0.

  - id: CRIT-705
    dimension: implementation_correctness
    description: >
      debounceSchedule locked signatures and IDLE_SAVE_DEBOUNCE_MS constant — the three
      exported functions carry the locked signatures from verification-architecture.md §2:
      computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs }): { shouldFire, fireAt };
      shouldFireIdleSave(editTimestamps, lastSaveTimestamp, debounceMs, nowMs): boolean;
      nextFireAt(lastEditTimestamp, debounceMs): number. The IDLE_SAVE_DEBOUNCE_MS exported
      constant equals 2000. No Date.now() call inside any of the three functions.
    weight: 0.06
    passThreshold: >
      debounceSchedule.test.ts boundary assertions pass 100%:
      computeNextFireAt({lastEditAt:1000,lastSaveAt:0,debounceMs:2000,nowMs:3001}) returns
      {shouldFire:true,fireAt:3000}; computeNextFireAt({...,nowMs:2999}) returns
      {shouldFire:false,fireAt:3000}; computeNextFireAt with lastSaveAt>lastEditAt+debounceMs
      returns {shouldFire:false,fireAt:null}; IDLE_SAVE_DEBOUNCE_MS===2000 assertion passes;
      purity grep (canonical pattern from verification-architecture.md §2) returns zero hits
      on debounceSchedule.ts.

  - id: CRIT-706
    dimension: structural_integrity
    description: >
      Purity boundary — the three pure-core modules (editorPredicates.ts, editorReducer.ts,
      debounceSchedule.ts) contain zero hits for the canonical forbidden-API grep pattern
      from verification-architecture.md §2. The impure shell modules (EditorPanel.svelte,
      BlockElement.svelte, SlashMenu.svelte, BlockDragHandle.svelte, SaveFailureBanner.svelte,
      tauriEditorAdapter.ts, editorStateChannel.ts, timerModule.ts, clipboardAdapter.ts,
      keyboardListener.ts) are the only files permitted to use $state/$effect/$derived, invoke(),
      listen(), setTimeout/clearTimeout, Date.now(), and DOM APIs. PROP-EDIT-047 (no
      svelte/store import). PROP-EDIT-039 (no EditingSessionState/EditorViewState assignment
      in *.svelte files).
    weight: 0.08
    passThreshold: >
      grep -E "Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api"
      promptnotes/src/lib/editor/editorPredicates.ts
      promptnotes/src/lib/editor/editorReducer.ts
      promptnotes/src/lib/editor/debounceSchedule.ts
      returns zero hits;
      grep -r "from 'svelte/store'" promptnotes/src/lib/editor/ returns zero hits;
      grep -r "EditingSessionState\|EditorViewState" promptnotes/src/lib/editor/*.svelte
      shows no assignment patterns (no =, +=, or object spread to those types).

  - id: CRIT-707
    dimension: structural_integrity
    description: >
      OUTBOUND/INBOUND adapter split (RD-016) — tauriEditorAdapter.ts contains exactly 16
      dispatchXxx methods corresponding to the 16 IPC EditorCommand variants (all except
      cancel-idle-timer) and MUST NOT call @tauri-apps/api/event listen(). editorStateChannel.ts
      contains only subscribeToState(handler) and MUST NOT call invoke(). No single file
      crosses both boundaries. The Svelte components wire the adapter and channel only via
      injected references (constructor/prop injection); they do not import tauriEditorAdapter.ts
      or editorStateChannel.ts directly in their module scope.
    weight: 0.07
    passThreshold: >
      grep -c "dispatch" promptnotes/src/lib/editor/tauriEditorAdapter.ts outputs exactly 16;
      grep "listen(" promptnotes/src/lib/editor/tauriEditorAdapter.ts returns zero hits;
      grep "invoke(" promptnotes/src/lib/editor/editorStateChannel.ts returns zero hits;
      tsc --noEmit --strict --noUncheckedIndexedAccess exits 0.

  - id: CRIT-708
    dimension: structural_integrity
    description: >
      Svelte 5 runes only — all *.svelte files under promptnotes/src/lib/editor/ use only
      Svelte 5 rune APIs ($state, $derived, $effect, $props, $bindable). No Svelte 4 store
      APIs (writable, readable, derived from svelte/store) and no createEventDispatcher are
      present in any editor source file. DESIGN.md token conformance: all hex / rgba / px
      values in editor *.svelte files are members of DESIGN.md §10 Token Reference; no
      font-weight outside {400,500,600,700}; SaveFailureBanner uses 5-layer Deep Shadow string
      verbatim (rgba(0,0,0,0.01) 0px 1px 3px, ...) and #dd5b00 accent.
    weight: 0.05
    passThreshold: >
      grep -r "from 'svelte/store'\|createEventDispatcher" promptnotes/src/lib/editor/ returns
      zero hits; grep -r "writable\|readable" promptnotes/src/lib/editor/*.svelte returns zero
      hits; grep -r "rgba(0,0,0,0.01) 0px 1px 3px" promptnotes/src/lib/editor/SaveFailureBanner.svelte
      returns exactly one hit; grep -r "#dd5b00" promptnotes/src/lib/editor/SaveFailureBanner.svelte
      returns exactly one hit; grep -r "font-weight" promptnotes/src/lib/editor/ | grep -vE
      "font-weight: (400|500|600|700)" returns zero hits.

  - id: CRIT-709
    dimension: edge_case_coverage
    description: >
      EC-EDIT-011 first-block backspace gating (PROP-EDIT-011, PROP-EDIT-028) — the pure
      classifier classifyBackspaceAtZero(0, n) returns 'first-block-noop' for any n>=1; the
      integration test asserts that pressing Backspace at offset 0 on the first Block (index 0)
      dispatches nothing. The gating is client-side and does not wait for a domain error
      response. classifyBackspaceAtZero property test passes >=100 fast-check runs over all
      valid (focusedIndex, blockCount) pairs.
    weight: 0.05
    passThreshold: >
      editorPredicates.property.test.ts property 'backspace-classifier-coverage' passes >=100
      fast-check runs; specifically: classifyBackspaceAtZero(0, fc.nat({min:1})) always returns
      'first-block-noop'; classifyBackspaceAtZero(k, n) for 0<k<n always returns 'merge';
      block-element.dom.vitest.ts assertion 'Backspace at offset 0 on first Block dispatches
      nothing' passes 100%.

  - id: CRIT-710
    dimension: edge_case_coverage
    description: >
      EC-EDIT-013 divider exact-match rule (PROP-EDIT-010, PROP-EDIT-030) — classifyMarkdownPrefix
      returns {newType:'divider',trimmedContent:''} if and only if content === '---' (3 hyphens,
      no prefix whitespace, no trailing characters). For '---more', '--- ', '----', '---\n'
      the function returns null. The integration test (slash-menu.dom.vitest.ts) asserts that
      a contenteditable Block whose textContent is exactly '---' dispatches ChangeBlockType
      {newType:'divider'} and that '--- ' does not.
    weight: 0.04
    passThreshold: >
      editorPredicates.property.test.ts property 'markdown-prefix-totality' includes a
      fast-check sub-assertion: fc.string().filter(s => s.startsWith('---') && s !== '---')
      always maps to null return from classifyMarkdownPrefix; passes >=100 runs;
      slash-menu.dom.vitest.ts assertions 'divider dispatched for exactly ---' (pass) and
      'no dispatch for --- with trailing space' (pass) both pass 100%.

  - id: CRIT-711
    dimension: edge_case_coverage
    description: >
      EC-EDIT-002 blur-while-saving/switching (PROP-EDIT-013, PROP-EDIT-032) — the pure reducer
      test confirms EditorBlurredAllBlocks in status='saving' returns commands=[]; in
      status='switching' also returns commands=[]. The integration test confirms no
      TriggerBlurSave IPC call is made when the mock adapter observes blur in those states.
    weight: 0.04
    passThreshold: >
      editorReducer.test.ts assertions 'EditorBlurredAllBlocks while saving returns commands=[]'
      and 'EditorBlurredAllBlocks while switching returns commands=[]' pass 100%;
      editor-panel.dom.vitest.ts assertion 'all-blocks blur while saving dispatches nothing'
      and 'all-blocks blur while switching dispatches nothing' both pass 100%;
      bun run test && bun run test:dom both exit 0.

  - id: CRIT-712
    dimension: edge_case_coverage
    description: >
      PROP-EDIT-024a/024b/024c — RequestNewNote interaction with save state. Three branches are
      covered by integration tests: (a) editing+isDirty=true dispatches TriggerBlurSave before
      RequestNewNote; (b) save-failed dispatches RequestNewNote directly; (c) editing+isDirty=false
      dispatches RequestNewNote directly without TriggerBlurSave. Each branch is asserted via
      mock adapter call-count verification using vi.fn() spies.
    weight: 0.04
    passThreshold: >
      editor-panel.dom.vitest.ts assertions named 'RequestNewNote while editing+dirty dispatches
      TriggerBlurSave first', 'RequestNewNote while save-failed dispatches directly',
      'RequestNewNote while editing+clean dispatches directly without TriggerBlurSave' each
      pass 100%; dispatchTriggerBlurSave mock call count is 1 in branch (a), 0 in branches
      (b) and (c); dispatchRequestNewNote mock call count is 1 in all branches after the
      appropriate save cycle completes.

  - id: CRIT-713
    dimension: verification_readiness
    description: >
      Branch coverage gate — @vitest/coverage-v8 reports >=95% branch coverage per file on
      the three pure modules: editorPredicates.ts, editorReducer.ts, debounceSchedule.ts.
      Exclude pattern: **/__tests__/**, **/*.svelte. The coverage run uses
      'bun run test:dom -- --coverage' with provider: 'v8'. Each file's branch coverage
      percentage is individually >=95 (not just aggregate).
    weight: 0.06
    passThreshold: >
      bun run test:dom -- --coverage inside promptnotes/ exits 0; the JSON coverage report
      (coverage/coverage-summary.json) shows branchCoverage.pct >= 95 for each of
      promptnotes/src/lib/editor/editorPredicates.ts,
      promptnotes/src/lib/editor/editorReducer.ts,
      promptnotes/src/lib/editor/debounceSchedule.ts individually.

  - id: CRIT-714
    dimension: verification_readiness
    description: >
      PROP-EDIT-040 per-variant DTO mirroring completeness — the fast-check property test
      'snapshot-per-variant-mirroring' in editorReducer.property.test.ts exercises all 5
      status arms of EditingSessionStateDto. For each status arm, the test asserts: (a)
      state.status === S.status; (b) every field present in the S.status arm has state[f] === S[f];
      (c) every field absent from that arm is set to its idle default (currentNoteId→null,
      focusedBlockId→null, isDirty→false, isNoteEmpty→true, pendingNextFocus→null,
      lastSaveError→null, lastSaveResult→null). The save-failed arm asserts
      state.focusedBlockId === S.priorFocusedBlockId.
    weight: 0.07
    passThreshold: >
      editorReducer.property.test.ts property 'snapshot-per-variant-mirroring' passes >=100
      fast-check runs; the property uses fc.oneof over 5 status-discriminated DTO arbitraries;
      all 5 arms are sampled within 100 runs (the property runs 500 times by default or uses
      fc.statistics to log coverage); bun run test exits 0.
---
# Sprint 7 Contract — ui-editor

## Sprint Goal

Sprint 7 replaces the complete textarea-based ui-editor implementation (Sprints 1–6) with the block-based one defined in `specs/behavioral-spec.md` (REQ-EDIT-001..038, EC-EDIT-001..014, NFR-EDIT-001..008) and `specs/verification-architecture.md` (PROP-EDIT-001..051). All source files under `promptnotes/src/lib/editor/` are rewritten. The shippable artifact is a passing full test suite (pure unit, fast-check property, and vitest+jsdom integration tiers) with branch coverage ≥ 95% on the three pure-core modules.

---

## Sequencing Notes

1. **Red phase first** — All test files (pure + integration) must be written and confirmed failing before any implementation file is modified.
2. **Pure core before shell** — Implement `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`, and `types.ts` first (pure tier passes). Then implement the Svelte components and IPC adapters (shell tier passes).
3. **Legacy purge** — The files `EditorPane.svelte`, the legacy 9-variant `EditorCommand` union in `types.ts`, and the `edit-note-body` / `EditNoteBody` symbol are removed as part of this sprint. The Phase 5 audit grep `grep -r "EditNoteBody\|edit-note-body" promptnotes/src/lib/editor/` must return zero hits.
4. **Rust backend** — `src-tauri/src/editor.rs` is adjusted only to keep `cargo check` green. New `#[tauri::command]` handlers for block commands are deferred to a follow-up feature.
5. **Contract review gate** — This contract must pass strict-mode adversary review (`/vcsdd-contract-review`) before the Red phase (Phase 2a) begins.

---

## In-Scope Modules

### Pure core

| File | New exports |
|---|---|
| `promptnotes/src/lib/editor/types.ts` | `EditorViewState`, `EditorAction` (block-based union), `EditorCommand` (17-variant per §10), `EditingSessionStateDto`, `EditorCommandSaveSource`, `SaveError`, `FsError`, `SaveValidationError`, `BlockType` |
| `promptnotes/src/lib/editor/editorPredicates.ts` | `canCopy`, `bannerMessageFor`, `classifySource`, `splitOrInsert`, `classifyMarkdownPrefix`, `classifyBackspaceAtZero` |
| `promptnotes/src/lib/editor/editorReducer.ts` | `editorReducer` |
| `promptnotes/src/lib/editor/debounceSchedule.ts` | `computeNextFireAt`, `shouldFireIdleSave`, `nextFireAt`, `IDLE_SAVE_DEBOUNCE_MS` |

### Svelte 5 components (impure shell)

`EditorPanel.svelte`, `BlockElement.svelte`, `SlashMenu.svelte`, `BlockDragHandle.svelte`, `SaveFailureBanner.svelte`

### IPC adapters (impure shell)

`tauriEditorAdapter.ts` (OUTBOUND, 16 dispatch methods), `editorStateChannel.ts` (INBOUND, `subscribeToState`)

### Test suite

`__tests__/editorPredicates.test.ts`, `__tests__/editorPredicates.property.test.ts`, `__tests__/editorReducer.test.ts`, `__tests__/editorReducer.property.test.ts`, `__tests__/debounceSchedule.test.ts`, `__tests__/debounceSchedule.property.test.ts`, `__tests__/editor-panel.dom.vitest.ts`, `__tests__/block-element.dom.vitest.ts`, `__tests__/slash-menu.dom.vitest.ts`, `__tests__/block-drag-handle.dom.vitest.ts`, `__tests__/editor-session-state.dom.vitest.ts`, `__tests__/save-failure-banner.dom.vitest.ts`, `__tests__/editor-validation.dom.vitest.ts`, `__tests__/editor-accessibility.dom.vitest.ts`

---

## Out of Scope

- `src-tauri/src/editor.rs` concrete block command handlers — follow-up VCSDD feature.
- DOM diffing libraries or WYSIWYG frameworks — contenteditable implemented directly per Svelte 5 patterns.
- DESIGN.md modifications.
- Any file outside `promptnotes/src/lib/editor/` and `src-tauri/src/editor.rs` (minimal adjustment only).

---

## Definition of Done

1. Red phase evidence: `new-feature-tests: FAIL` and `regression-baseline: PASS` with raw failing test output.
2. Green phase: `bun run test` (pure + property) and `bun run test:dom` (integration) inside `promptnotes/` both exit 0 with zero failures.
3. Branch coverage: `bun run test:dom -- --coverage` reports branch coverage ≥ 95% per file for the three pure modules.
4. Purity audit: canonical grep pattern (verification-architecture.md §2) returns zero hits on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`.
5. Type check: `tsc --noEmit --strict --noUncheckedIndexedAccess` inside `promptnotes/` exits 0.
6. Legacy purge: `grep -r "EditNoteBody\|edit-note-body\|from 'svelte/store'" promptnotes/src/lib/editor/` returns zero hits.
7. Security: `grep -r "{@html\|innerHTML\|outerHTML\|insertAdjacentHTML" promptnotes/src/lib/editor/` returns zero hits.
8. All 15 CRIT-700..CRIT-714 pass in adversary review with zero critical and zero major findings.

---

## Weight Total

CRIT-700 (0.16) + CRIT-701 (0.09) + CRIT-702 (0.05) + CRIT-703 (0.14) + CRIT-704 (0.10) + CRIT-705 (0.06) + CRIT-706 (0.08) + CRIT-707 (0.07) + CRIT-708 (0.05) + CRIT-709 (0.05) + CRIT-710 (0.04) + CRIT-711 (0.04) + CRIT-712 (0.04) + CRIT-713 (0.06) + CRIT-714 (0.07) = **1.00**
