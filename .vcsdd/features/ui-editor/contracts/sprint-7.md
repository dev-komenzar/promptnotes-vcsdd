---
sprintNumber: 7
feature: ui-editor
status: draft
negotiationRound: 1
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
      are covered by *.test.ts or promptnotes/src/lib/editor/__tests__/prop/*.prop.test.ts.
      Integration-tier REQs (PROP-EDIT-016..039, PROP-EDIT-041, PROP-EDIT-043..051) are covered
      by promptnotes/src/lib/editor/__tests__/dom/*.dom.vitest.ts.
      Legacy EditNoteBody / edit-note-body symbol is absent from all editor source and test files.
    weight: 0.14
    passThreshold: >
      grep -r "REQ-EDIT-" promptnotes/src/lib/editor/__tests__/ produces at least one match
      for each of REQ-EDIT-001 through REQ-EDIT-038 (38 IDs); grep -r "EditNoteBody\|edit-note-body"
      promptnotes/src/lib/editor/ returns zero hits; cd promptnotes && bun run check 2>&1 |
      grep "src/lib/editor/" | grep -E "ERROR|WARNING" | wc -l outputs 0 (editor-scope type
      check clean; pre-existing errors in feed/* and other routes are out of scope).

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
    weight: 0.08
    passThreshold: >
      Each EC-EDIT-001..014 ID appears in at least one test assertion comment or description
      string inside promptnotes/src/lib/editor/__tests__/; grep -rn "EC-EDIT-0(0[1-9]|1[0-4])"
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
      Each of the 17 EditorCommand kind literals appears at least once in
      promptnotes/src/lib/editor/types.ts via individual greps for the kebab-case literal:
      `for k in focus-block edit-block-content insert-block-after insert-block-at-beginning
      remove-block merge-blocks split-block change-block-type move-block cancel-idle-timer
      trigger-idle-save trigger-blur-save retry-save discard-current-session cancel-switch
      copy-note-body request-new-note; do grep -q "'$k'" promptnotes/src/lib/editor/types.ts
      || exit 1; done`; grep "edit-note-body" promptnotes/src/lib/editor/types.ts returns
      zero hits; cd promptnotes && bun run check 2>&1 | grep "src/lib/editor/" | grep "ERROR"
      | wc -l outputs 0 (editor-scope tsc clean); cd promptnotes && bun test src/lib/editor/__tests__/prop/editorReducer.prop.test.ts
      exits 0.

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
    weight: 0.12
    passThreshold: >
      cd promptnotes && bun run test:dom exits 0 (DOM tier vitest, 215+ tests);
      cd promptnotes && bun test src/lib/editor/__tests__/prop/ exits 0 (Bun runs *.prop.test.ts;
      vitest config excludes them by extension);
      grep -E "PROP-EDIT-(001|002|003|004|005|006|007|008|010|011|040)" -c
      promptnotes/src/lib/editor/__tests__/prop/*.prop.test.ts produces a non-zero match per
      ID, confirming each required Tier 2 PROP has at least one fast-check property;
      fast-check uses its default run count (numRuns=100) per property unless overridden in
      the test source.

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
    weight: 0.09
    passThreshold: >
      cd promptnotes && bun test src/lib/editor/__tests__/editorReducer.test.ts exits 0 with
      coverage of these REQ/EC IDs in test names: REQ-EDIT-004 (NoteFileSaved isDirty=false),
      REQ-EDIT-013 (saving→editing emits cancel-idle-timer), EC-EDIT-002 (EditorBlurredAllBlocks
      while saving and while switching return commands=[]), REQ-EDIT-017/018 (same-note
      BlockFocused emits no save/cancel-timer commands), REQ-EDIT-001 (editing snapshot mirrors
      focusedBlockId), REQ-EDIT-023 (save-failed snapshot copies priorFocusedBlockId);
      cd promptnotes && bun test src/lib/editor/__tests__/editorPredicates.test.ts exits 0
      with PROP-EDIT-042 coverage of all 5 FsError → Japanese string mappings and 2
      SaveValidationError → null mappings (test names contain these IDs);
      grep -E "PROP-EDIT-042|REQ-EDIT-004|REQ-EDIT-013|EC-EDIT-002|REQ-EDIT-017|REQ-EDIT-018|REQ-EDIT-001|REQ-EDIT-023"
      promptnotes/src/lib/editor/__tests__/editor*.test.ts produces matches for each ID.

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
      cd promptnotes && bun test src/lib/editor/__tests__/debounceSchedule.test.ts exits 0
      with boundary coverage (test names reference REQ-EDIT-012 and the 4 boundary cases:
      debounce elapsed unsaved, debounce not-yet elapsed, lastSaveAt after window, constant
      equals 2000); the canonical purity-audit grep pattern from verification-architecture.md
      §2 returns zero hits when run against
      promptnotes/src/lib/editor/debounceSchedule.ts.

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
    weight: 0.07
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
    weight: 0.06
    passThreshold: >
      Each of the 16 OUTBOUND method names appears at least once in
      promptnotes/src/lib/editor/tauriEditorAdapter.ts via individual greps:
      `for m in dispatchFocusBlock dispatchEditBlockContent dispatchInsertBlockAfter
      dispatchInsertBlockAtBeginning dispatchRemoveBlock dispatchMergeBlocks dispatchSplitBlock
      dispatchChangeBlockType dispatchMoveBlock dispatchTriggerIdleSave dispatchTriggerBlurSave
      dispatchRetrySave dispatchDiscardCurrentSession dispatchCancelSwitch dispatchCopyNoteBody
      dispatchRequestNewNote; do grep -q "$m" promptnotes/src/lib/editor/tauriEditorAdapter.ts
      || exit 1; done`;
      grep "listen(" promptnotes/src/lib/editor/tauriEditorAdapter.ts returns zero hits;
      grep "invoke(" promptnotes/src/lib/editor/editorStateChannel.ts returns zero hits;
      cd promptnotes && bun run check 2>&1 | grep "src/lib/editor/" | grep "ERROR" | wc -l
      outputs 0.

  - id: CRIT-708
    dimension: structural_integrity
    description: >
      Svelte 5 runes only — all *.svelte files under promptnotes/src/lib/editor/ use only
      Svelte 5 rune APIs ($state, $derived, $effect, $props, $bindable). No Svelte 4 store
      APIs (writable, readable, derived from svelte/store) and no createEventDispatcher are
      present in any editor source file. DESIGN.md token conformance: all hex / rgba / px
      values in editor *.svelte files are members of DESIGN.md §10 Token Reference; no
      font-weight outside {400,500,600,700}; SaveFailureBanner uses 5-layer Deep Shadow and
      #dd5b00 accent per DESIGN.md.
    weight: 0.04
    passThreshold: >
      grep -r "from 'svelte/store'\|createEventDispatcher" promptnotes/src/lib/editor/ returns
      zero hits; grep -r "writable\|readable" promptnotes/src/lib/editor/*.svelte returns zero
      hits; grep -r "0px 23px 52px" promptnotes/src/lib/editor/SaveFailureBanner.svelte
      returns at least one hit (presence of the unique outer-shadow layer confirms the 5-layer
      Deep Shadow string); grep -r "#dd5b00" promptnotes/src/lib/editor/SaveFailureBanner.svelte
      returns at least one hit (the orange accent token may appear as both data attribute and
      CSS, so >=1 is sufficient); grep -r "font-weight" promptnotes/src/lib/editor/ | grep -vE
      "font-weight: (400|500|600|700)" returns zero hits.

  - id: CRIT-709
    dimension: edge_case_coverage
    description: >
      EC-EDIT-011 first-block backspace gating (PROP-EDIT-011, PROP-EDIT-028) — the pure
      classifier classifyBackspaceAtZero(0, n) returns 'first-block-noop' for any n>=1; the
      integration test asserts that pressing Backspace at offset 0 on the first Block (index 0)
      dispatches nothing. The gating is client-side and does not wait for a domain error
      response. classifyBackspaceAtZero property test passes at least the fast-check default
      run count over all valid (focusedIndex, blockCount) pairs.
    weight: 0.05
    passThreshold: >
      cd promptnotes && bun test src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts
      exits 0; grep "PROP-EDIT-011" promptnotes/src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts
      produces at least one match (the property is present);
      cd promptnotes && bun run test:dom src/lib/editor/__tests__/dom/block-element.dom.vitest.ts
      exits 0 with EC-EDIT-011 first-block backspace gating asserted by test name.

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
      cd promptnotes && bun test src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts
      exits 0; grep -E "EC-EDIT-013|PROP-EDIT-010" promptnotes/src/lib/editor/__tests__/prop/editorPredicates.prop.test.ts
      produces at least one match (the divider exact-match property is present);
      cd promptnotes && bun run test:dom src/lib/editor/__tests__/dom/slash-menu.dom.vitest.ts
      exits 0 with EC-EDIT-013 divider rule asserted (content equal to three hyphens dispatches
      ChangeBlockType for divider; trailing-space variant does NOT).

  - id: CRIT-711
    dimension: edge_case_coverage
    description: >
      EC-EDIT-002 blur-while-saving/switching (PROP-EDIT-013, PROP-EDIT-032) — the pure reducer
      test confirms EditorBlurredAllBlocks in status='saving' returns commands=[]; in
      status='switching' also returns commands=[]. The integration test confirms no
      TriggerBlurSave IPC call is made when the mock adapter observes blur in those states.
    weight: 0.04
    passThreshold: >
      cd promptnotes && bun test src/lib/editor/__tests__/editorReducer.test.ts exits 0
      with two EC-EDIT-002 test names (saving + switching);
      cd promptnotes && bun run test:dom src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts
      exits 0 with two EC-EDIT-002 blur-dispatch-nothing assertions in test names.

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
      cd promptnotes && bun run test:dom src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts
      exits 0 with three test names covering the three branches (REQ-EDIT-035 editing+dirty
      → TriggerBlurSave before RequestNewNote; EC-EDIT-008 save-failed → RequestNewNote
      direct; REQ-EDIT-035 editing+clean → RequestNewNote direct);
      grep -c "PROP-EDIT-024[abc]" promptnotes/src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts
      outputs at least 3 (one per branch).

  - id: CRIT-713
    dimension: verification_readiness
    description: >
      Branch coverage gate — the three pure modules (editorPredicates.ts, editorReducer.ts,
      debounceSchedule.ts) achieve >=95% branch coverage per file. Note: pure-tier tests run
      under Bun's native runner (`bun test`) because vitest's include pattern matches only
      `*.vitest.ts`; vitest's @vitest/coverage-v8 instruments only DOM-tier files. Coverage
      is therefore measured via `bun test --coverage` whose stdout reports per-file branch %.
      As a fallback when Bun coverage output is environmentally unavailable, the equivalent
      rigour is provided by the Tier 2 fast-check property tests (CRIT-703) plus the canonical
      purity audit (CRIT-706) plus a clean `tsc --strict --noUncheckedIndexedAccess`.
    weight: 0.06
    passThreshold: >
      Note: pure tests run via bun test (Bun native); vitest covers the DOM tier only.
      Branch-coverage measurement is therefore split: (a) Bun's native coverage `bun test
      --coverage src/lib/editor/__tests__/editor*.test.ts src/lib/editor/__tests__/debounceSchedule.test.ts
      src/lib/editor/__tests__/prop/` reports per-file branch coverage in stdout; the
      pass threshold is >=95% branches (or "Branch %" column) on each of editorPredicates.ts,
      editorReducer.ts, debounceSchedule.ts. If Bun's coverage output is unavailable in this
      environment, the equivalent rigour is provided by the Tier 2 fast-check property tests
      (CRIT-703) covering all branches via random input enumeration. Verified at Phase 5
      hardening; this gate is treated as satisfied if (CRIT-703 passes) AND (canonical purity
      grep on the 3 pure modules returns zero hits) AND (no pure-tier function has an
      unreachable branch surfaced by `tsc --strict --noUncheckedIndexedAccess`).

  - id: CRIT-714
    dimension: verification_readiness
    description: >
      PROP-EDIT-040 per-variant DTO mirroring completeness — the fast-check property tests
      in promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts exercise all 5
      status arms of EditingSessionStateDto. For each status arm, the tests assert: (a)
      state.status === S.status; (b) every field present in the S.status arm has state[f] === S[f];
      (c) every field absent from that arm is set to its idle default (currentNoteId->null,
      focusedBlockId->null, isDirty->false, isNoteEmpty->true, pendingNextFocus->null,
      lastSaveError->null, lastSaveResult->null). The save-failed arm asserts
      state.focusedBlockId === S.priorFocusedBlockId.
    weight: 0.06
    passThreshold: >
      cd promptnotes && bun test src/lib/editor/__tests__/prop/editorReducer.prop.test.ts
      exits 0; grep -c "PROP-EDIT-040" promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts
      outputs at least 5 (one property per status arm: idle, editing, saving, switching,
      save-failed); fast-check uses default numRuns=100 per property unless overridden;
      grep "priorFocusedBlockId" promptnotes/src/lib/editor/__tests__/prop/editorReducer.prop.test.ts
      produces at least one match (the save-failed → focusedBlockId mapping is asserted).
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

`__tests__/editorPredicates.test.ts`, `__tests__/editorPredicates.test.ts`, `__tests__/editorReducer.test.ts`, `__tests__/debounceSchedule.test.ts`, `__tests__/prop/editorPredicates.prop.test.ts`, `__tests__/prop/editorReducer.prop.test.ts`, `__tests__/prop/debounceSchedule.prop.test.ts`, `__tests__/dom/editor-panel.dom.vitest.ts`, `__tests__/dom/block-element.dom.vitest.ts`, `__tests__/dom/slash-menu.dom.vitest.ts`, `__tests__/dom/block-drag-handle.dom.vitest.ts`, `__tests__/dom/editor-session-state.dom.vitest.ts`, `__tests__/dom/save-failure-banner.dom.vitest.ts`, `__tests__/dom/editor-validation.dom.vitest.ts`, `__tests__/dom/editor-accessibility.dom.vitest.ts`

---

## Out of Scope

- `src-tauri/src/editor.rs` concrete block command handlers — follow-up VCSDD feature.
- DOM diffing libraries or WYSIWYG frameworks — contenteditable implemented directly per Svelte 5 patterns.
- DESIGN.md modifications.
- Any file outside `promptnotes/src/lib/editor/` and `src-tauri/src/editor.rs` (minimal adjustment only).

---

## Definition of Done

Note on test runners: the `promptnotes/` package has TWO test runners. Bun native (`bun test`) discovers `*.test.ts` and `*.prop.test.ts`. Vitest (`bun run test:dom`) discovers only `**/__tests__/dom/**/*.vitest.ts` per `vitest.config.ts`. Pure unit and property tests therefore run under Bun; DOM/integration tests run under vitest.

1. Red phase evidence: `new-feature-tests: FAIL` and `regression-baseline: PASS` with raw failing test output from BOTH `bun test` (pure + property) and `bun run test:dom` (DOM tier).
2. Green phase: `cd promptnotes && bun test` exits 0 (or with only pre-existing non-editor failures) AND `cd promptnotes && bun run test:dom` exits 0 with zero failures.
3. Branch coverage: per CRIT-713 — preferred path is `cd promptnotes && bun test --coverage src/lib/editor/__tests__/editor*.test.ts src/lib/editor/__tests__/debounceSchedule.test.ts src/lib/editor/__tests__/prop/` reports ≥ 95% branches per pure module; if the Bun coverage output is unavailable in this environment, the equivalent rigour is provided by Tier 2 fast-check property tests (CRIT-703) plus the canonical purity audit (CRIT-706) plus `tsc --strict --noUncheckedIndexedAccess` exit 0 on the pure modules.
4. Purity audit: canonical grep pattern (verification-architecture.md §2) returns zero hits on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`.
5. Type check (editor scope): `cd promptnotes && bun run check 2>&1 | grep "src/lib/editor/" | grep -E "ERROR|WARNING" | wc -l` outputs 0.
6. Legacy purge: `grep -r "EditNoteBody\|edit-note-body\|from 'svelte/store'" promptnotes/src/lib/editor/` returns zero hits.
7. Security: `grep -r "{@html\|innerHTML\|outerHTML\|insertAdjacentHTML" promptnotes/src/lib/editor/` returns zero hits.
8. All 15 CRIT-700..CRIT-714 pass in adversary review with zero critical and zero major findings.

---

## Weight Total

CRIT-700 (0.14) + CRIT-701 (0.08) + CRIT-702 (0.05) + CRIT-703 (0.12) + CRIT-704 (0.09) + CRIT-705 (0.06) + CRIT-706 (0.07) + CRIT-707 (0.06) + CRIT-708 (0.04) + CRIT-709 (0.05) + CRIT-710 (0.04) + CRIT-711 (0.04) + CRIT-712 (0.04) + CRIT-713 (0.06) + CRIT-714 (0.06) = **1.00**
