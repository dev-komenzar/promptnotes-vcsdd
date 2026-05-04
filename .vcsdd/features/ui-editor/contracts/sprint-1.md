---
sprintNumber: 1
feature: ui-editor
status: approved
scope: "Pure core of the ui-editor feature: the deterministic, side-effect-free modules that constitute the testable logic layer. Specifically: the state predicates (canCopy, isEmptyAfterTrim, bannerMessageFor, classifySource), the mirror reducer (editorReducer), the debounce scheduling logic (computeNextFireAt, shouldFireIdleSave, nextFireAt), and the TypeScript type definitions (EditorViewState, EditorAction, EditorCommand 9-variant union, SaveError, EditingSessionStatus 5 variants). EXPLICITLY EXCLUDED from this sprint: Svelte components (EditorPanel.svelte, SaveFailureBanner.svelte), Tauri invoke/listen calls (tauriEditorAdapter.ts, editorStateChannel.ts), the setTimeout/clearTimeout shell (timerModule.ts), the clipboard adapter (clipboardAdapter.ts), DOM event handlers (keyboard listener, blur/input event wiring), $state/$effect/$derived runes (component-tier only), and all DOM integration tests (*.dom.vitest.ts). Sprint 2 delivers the effectful shell and component integration."
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: "REQ-EDIT-001, REQ-EDIT-002 — editorReducer correctly transitions isDirty: NoteBodyEdited sets isDirty=true; NoteFileSaved sets isDirty=false; NoteSaveFailed retains isDirty=true. The reducer never mutates EditingSessionState directly; it only produces EditorViewState. Covered by PROP-EDIT-001 and PROP-EDIT-008."
    weight: 0.09
    passThreshold: "PROP-EDIT-001 proved: editorReducer.property.test.ts property 'idempotent-dirty' passes ≥100 fast-check runs; editorReducer.test.ts NoteFileSaved/NoteSaveFailed/NoteBodyEdited assertions pass 100%. PROP-EDIT-008 proved: editorReducer.property.test.ts property 'referential-transparency' passes ≥100 fast-check runs."
  - id: CRIT-002
    dimension: spec_fidelity
    description: "REQ-EDIT-026 — every EditorCommand in the commands array produced by editorReducer for any save-triggering action carries a source field whose value equals the source from the triggering action payload, drawn exclusively from EditorCommandSaveSource ('capture-idle' | 'capture-blur'). The strings 'idle', 'blur', 'switch', 'manual' must never appear. Covered by PROP-EDIT-002."
    weight: 0.11
    passThreshold: "PROP-EDIT-002 proved: editorReducer.property.test.ts property 'source-pass-through' passes ≥100 fast-check runs over all save-triggering action variants; assertion confirms commands[].source ∈ {'capture-idle','capture-blur'} and equals action payload source."
  - id: CRIT-003
    dimension: spec_fidelity
    description: "REQ-EDIT-004, REQ-EDIT-005, EC-EDIT-001 — debounce schedule semantics: given any sequence of edit timestamps where the last edit is at least debounceMs before nowMs with no later edit, computeNextFireAt returns {shouldFire: true, fireAt: lastEditAt + debounceMs}. For rapid bursts (any edit within the debounce window), shouldFireIdleSave returns false. The IDLE_SAVE_DEBOUNCE_MS constant equals 2000. Covered by PROP-EDIT-003."
    weight: 0.10
    passThreshold: "PROP-EDIT-003 proved: debounceSchedule.property.test.ts property 'debounce-semantics' passes ≥100 fast-check runs; debounceSchedule.test.ts boundary cases (exactly at threshold, one ms before, one ms after) pass 100%. IDLE_SAVE_DEBOUNCE_MS exported constant equals 2000."
  - id: CRIT-004
    dimension: spec_fidelity
    description: "REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-002 — blur-cancels-idle semantics in the pure schedule model: if a blur event is recorded at time tb while a pending idle save is scheduled for ts > tb, the schedule model reports that the idle save must not fire at ts. Blur and idle saves do not both fire for the same dirty interval. editorReducer with (status='saving', BlurEvent) returns commands=[] — no TriggerBlurSave. Covered by PROP-EDIT-004 and PROP-EDIT-011."
    weight: 0.10
    passThreshold: "PROP-EDIT-004 proved: debounceSchedule.property.test.ts property 'blur-cancels-idle' passes ≥100 fast-check runs. PROP-EDIT-011 proved: editorReducer.test.ts BlurEvent-while-saving assertion returns {commands: []} passes 100%."
  - id: CRIT-005
    dimension: spec_fidelity
    description: "REQ-EDIT-015, REQ-EDIT-016 — bannerMessageFor returns the exact Japanese user-facing strings for all four FsError variants (permission, disk-full, lock, unknown) and returns null for both SaveValidationError variants (empty-body-on-idle, invariant-violated). The function is total: never throws, never returns undefined. The TypeScript switch is exhaustive (compile-time Tier 0 guarantee). Covered by PROP-EDIT-005 and PROP-EDIT-031."
    weight: 0.10
    passThreshold: "PROP-EDIT-005 proved: editorPredicates.property.test.ts property 'banner-exhaustiveness' passes ≥100 fast-check runs; bannerMessageFor never throws. PROP-EDIT-031 proved: editorPredicates.test.ts exact-string assertions for all four FsError variants and both null-returning validation variants pass 100%. tsc --strict --noUncheckedIndexedAccess exits 0 (exhaustive switch)."
  - id: CRIT-006
    dimension: edge_case_coverage
    description: "REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006 — canCopy predicate: for status ∈ {'idle','switching','save-failed'} returns false regardless of body content; for status ∈ {'editing','saving'} returns !isEmptyAfterTrim(bodyStr). isEmptyAfterTrim uses ECMAScript String.prototype.trim (body.trim().length === 0). Tested over randomly generated body strings and all 5 status values. Covered by PROP-EDIT-006."
    weight: 0.10
    passThreshold: "PROP-EDIT-006 proved: editorPredicates.property.test.ts property 'copy-enable-parity' passes ≥100 fast-check runs over arbitrary body strings and all 5 status variants; canCopy(body,'idle')===false, canCopy(body,'switching')===false, canCopy(body,'save-failed')===false for any body; canCopy(body,'editing')=== !isEmptyAfterTrim(body) and canCopy(body,'saving')=== !isEmptyAfterTrim(body) for any body."
  - id: CRIT-007
    dimension: edge_case_coverage
    description: "REQ-EDIT-009 through REQ-EDIT-013 — editorReducer totality: for every (status, action) pair in the cross-product the reducer returns a defined EditorViewState whose status is one of the 5 legal values ('idle'|'editing'|'saving'|'switching'|'save-failed'), a ReadonlyArray commands where each element's kind is one of the 9 EditorCommand variants, and never throws. isDirty transitions follow aggregates.md:273-276 exactly. Covered by PROP-EDIT-007."
    weight: 0.10
    passThreshold: "PROP-EDIT-007 proved: editorReducer.property.test.ts property 'reducer-totality' passes ≥100 fast-check runs across all status×action cross-product pairs; no undefined state, no throw, no out-of-enum status, no undefined commands, no unknown EditorCommand kind. editorReducer.test.ts isDirty transition table assertions (editing+NoteBodyEdited→true, saving+NoteFileSaved→false, saving+NoteSaveFailed→true retained) pass 100%."
  - id: CRIT-008
    dimension: edge_case_coverage
    description: "REQ-EDIT-005, REQ-EDIT-002 — after NoteFileSaved, editorReducer emits {kind:'cancel-idle-timer'} in commands (the impure shell will call clearTimeout on this signal). The returned state has isDirty===false and commands does not re-emit a trigger-idle-save command. Covered by PROP-EDIT-010."
    weight: 0.08
    passThreshold: "PROP-EDIT-010 proved: editorReducer.test.ts NoteFileSaved assertion: result.state.isDirty===false AND result.commands contains exactly one {kind:'cancel-idle-timer'} and contains no {kind:'trigger-idle-save'} entry passes 100%."
  - id: CRIT-009
    dimension: implementation_correctness
    description: "RD-019, REQ-EDIT-004 — computeNextFireAt and shouldFireIdleSave use the locked signatures from behavioral-spec.md §12 and verification-architecture.md §2: computeNextFireAt({lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number}): {shouldFire: boolean, fireAt: number|null}. The function never calls Date.now() internally; nowMs is always supplied by the caller. nextFireAt(lastEditTimestamp, debounceMs): number is a pure helper. Covered by debounceSchedule.test.ts boundary assertions."
    weight: 0.07
    passThreshold: "debounceSchedule.test.ts: computeNextFireAt({lastEditAt:1000, lastSaveAt:0, debounceMs:2000, nowMs:3001}) returns {shouldFire:true, fireAt:3000}; computeNextFireAt({lastEditAt:1000, lastSaveAt:0, debounceMs:2000, nowMs:2999}) returns {shouldFire:false, fireAt:3000}; computeNextFireAt with lastSaveAt > lastEditAt+debounceMs returns {shouldFire:false, fireAt:null}. All boundary assertions pass 100%."
  - id: CRIT-010
    dimension: implementation_correctness
    description: "RD-017, RD-018 — EditorCommand is exactly the 9-variant discriminated union from verification-architecture.md §10: 'edit-note-body','trigger-idle-save','trigger-blur-save','cancel-idle-timer','retry-save','discard-current-session','cancel-switch','copy-note-body','request-new-note'. The 'edit-note-body' payload includes {noteId:string, newBody:string, issuedAt:string, dirty:true}. The 'copy-note-body' payload includes {noteId:string, body:string}. tsc --strict enforces exhaustiveness. PROP-EDIT-007 cross-product test confirms commands[].kind is always in the 9-variant set."
    weight: 0.07
    passThreshold: "tsc --noEmit --strict --noUncheckedIndexedAccess exits 0 in promptnotes/. editorReducer.property.test.ts property 'reducer-totality' confirms every commands[].kind is a member of the 9-variant EditorCommand union (checked via Set membership assertion) passes ≥100 fast-check runs."
  - id: CRIT-011
    dimension: implementation_correctness
    description: "RD-013, RD-006 — classifySource is a pure total mapping: 'idle' → 'capture-idle', 'blur' → 'capture-blur'. The return type is the literal union 'capture-idle'|'capture-blur' (TypeScript Tier 0 enforcement). No other strings are returned. The predicate isEmptyAfterTrim uses body.trim().length===0 (ECMAScript String.prototype.trim). Both functions pass the Phase 5 canonical purity-audit grep (no Date.now, no window, no @tauri-apps/api, no setTimeout, etc.)."
    weight: 0.05
    passThreshold: "editorPredicates.test.ts: classifySource('idle')==='capture-idle' and classifySource('blur')==='capture-blur' assertions pass 100%. tsc --strict exit 0 confirms return type is literal union. Phase 5 purity grep (canonical pattern from verification-architecture.md §2) returns zero hits on editorPredicates.ts."
  - id: CRIT-012
    dimension: spec_fidelity
    description: "REQ-EDIT-014 — DomainSnapshotReceived mirroring: when the reducer receives a DomainSnapshotReceived action with snapshot S, the resulting EditorViewState mirrors S.status, S.isDirty, S.currentNoteId, and S.pendingNextNoteId exactly — no transformation, no partial copy, no default override. Covered by a dedicated deterministic unit test and a fast-check property test."
    weight: 0.03
    passThreshold: "editorReducer.test.ts assertion 'DomainSnapshotReceived mirrors S.status/isDirty/currentNoteId/pendingNextNoteId': for arbitrary state s and snapshot S, editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state satisfies state.status === S.status AND state.isDirty === S.isDirty AND state.currentNoteId === S.currentNoteId AND state.pendingNextNoteId === S.pendingNextNoteId — passes 100%. editorReducer.property.test.ts property 'snapshot mirroring is identity over state fields' passes ≥100 fast-check runs."
---

# Sprint 1: ui-editor pure core

This contract captures 12 acceptance criteria (CRIT-001..CRIT-012) derived from REQ-EDIT-001..REQ-EDIT-016, REQ-EDIT-022, REQ-EDIT-026, EC-EDIT-001..EC-EDIT-002, EC-EDIT-006, and PROP-EDIT-001..PROP-EDIT-011 as defined in `specs/behavioral-spec.md` (REQ-EDIT-001..027, EC-EDIT-001..010, RD-001..020) and `specs/verification-architecture.md` (PROP-EDIT-001..040, including 020a/020b).

The spec passed Phase 1c review. The pure-core boundary is defined by the canonical purity-audit pattern in `specs/verification-architecture.md §2`. Sprint 2 will deliver the effectful shell (Svelte components, IPC adapters, timer shell, keyboard listener, DOM integration tests).

---

## 1. Sprint Goal

This sprint produces three importable TypeScript modules — `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts` — plus the type definitions in `types.ts`, all under `promptnotes/src/lib/editor/`. Every module is deterministic and side-effect-free. The shippable artifact is a passing vitest suite covering all Tier 1 unit tests and all Tier 2 fast-check property tests for the pure core, with branch coverage ≥ 95% across all three pure modules as measured by `@vitest/coverage-v8`.

---

## 2. In-Scope Modules

- `promptnotes/src/lib/editor/types.ts` — Declares `EditorViewState` (status, isDirty, currentNoteId, pendingNextNoteId), `EditorAction` (closed discriminated union of all actions accepted by the reducer — see enumeration below), `EditorCommand` (the 9-variant discriminated union from `verification-architecture.md §10`: `'edit-note-body'`, `'trigger-idle-save'`, `'trigger-blur-save'`, `'cancel-idle-timer'`, `'retry-save'`, `'discard-current-session'`, `'cancel-switch'`, `'copy-note-body'`, `'request-new-note'`), `SaveError` (`{ kind: 'fs', reason: FsError } | { kind: 'validation', reason: SaveValidationError }`), `EditingSessionStatus` (the 5-variant string literal union `'idle' | 'editing' | 'saving' | 'switching' | 'save-failed'`), and the `EditorCommandSaveSource` alias (`'capture-idle' | 'capture-blur'`).

  The `EditorAction` discriminated union is **closed** — the reducer must be **total** over the cross-product `EditorAction.kind × EditingSessionStatus` (11 actions × 5 statuses = 55 cells). The exhaustive switch is enforced at compile time by `tsc --strict --noUncheckedIndexedAccess` (CRIT-010). The variant set is:

  | Variant kind | Payload | Driving REQs | Origin |
  |---|---|---|---|
  | `'NoteBodyEdited'` | `{ newBody: string }` | REQ-EDIT-001 | UI typed event (user keystroke) |
  | `'BlurEvent'` | `{}` | REQ-EDIT-006 | UI focus loss |
  | `'IdleTimerFired'` | `{ nowMs: number }` | REQ-EDIT-004 | Impure shell signal |
  | `'DomainSnapshotReceived'` | `{ snapshot: EditingSessionState }` | REQ-EDIT-014 | Inbound from editorStateChannel |
  | `'NoteFileSaved'` | `{ noteId: string; savedAt: string }` | REQ-EDIT-002, REQ-EDIT-005 | Inbound domain event (spec §3.4a saving→editing/idle transition) |
  | `'NoteSaveFailed'` | `{ noteId: string; error: SaveError }` | REQ-EDIT-002 | Inbound domain event (spec §3.4a save-failed transition) |
  | `'RetryClicked'` | `{}` | REQ-EDIT-017 | UI retry button |
  | `'DiscardClicked'` | `{}` | REQ-EDIT-018 | UI discard button |
  | `'CancelClicked'` | `{}` | REQ-EDIT-019 | UI cancel button (cancel-switch flow) |
  | `'CopyClicked'` | `{}` | REQ-EDIT-021 | UI copy button |
  | `'NewNoteClicked'` | `{ source: 'explicit-button' \| 'ctrl-N' }` | REQ-EDIT-023, REQ-EDIT-024 | UI new-note button or keyboard shortcut |

- `promptnotes/src/lib/editor/editorPredicates.ts` — Pure exported functions:
  - `canCopy(bodyStr: string, status: EditorViewState['status']): boolean` — `false` for `status ∈ {'idle','switching','save-failed'}` regardless of body; `!isEmptyAfterTrim(bodyStr)` for `status ∈ {'editing','saving'}`.
  - `isEmptyAfterTrim(bodyStr: string): boolean` — `bodyStr.trim().length === 0` per ECMAScript `String.prototype.trim`.
  - `bannerMessageFor(error: SaveError): string | null` — exhaustive switch over `SaveError` variants, returning the exact Japanese strings from REQ-EDIT-016; `null` for both validation variants.
  - `classifySource(triggerKind: 'idle' | 'blur'): 'capture-idle' | 'capture-blur'` — pure mapping; `'idle' → 'capture-idle'`; `'blur' → 'capture-blur'`.
  - MUST NOT import `@tauri-apps/api` or any forbidden API from the canonical purity-audit pattern.

- `promptnotes/src/lib/editor/editorReducer.ts` — Pure exported function:
  - `editorReducer(state: EditorViewState, action: EditorAction): { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }` — total function over all (status, action) pairs; never throws; every returned `state.status` is in the 5-variant enum; `commands` is always a `ReadonlyArray`; each `commands[i].kind` is one of the 9 `EditorCommand` variants.
  - `isDirty` transitions: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained; `DomainSnapshotReceived { snapshot } → mirror snapshot fields directly`.
  - `commands` for `NoteFileSaved` must include `{ kind: 'cancel-idle-timer' }`.
  - `source` pass-through: save-triggering actions must produce `EditorCommand` entries whose `source` equals the action payload's `source`; the reducer never infers or defaults `source`.
  - MUST NOT import `@tauri-apps/api` or any forbidden API from the canonical purity-audit pattern.

- `promptnotes/src/lib/editor/debounceSchedule.ts` — Pure exported functions:
  - `computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number }): { shouldFire: boolean, fireAt: number | null }` — locked signature from RD-019; `nowMs` is always supplied by the caller; the function never calls `Date.now()`.
  - `shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean` — property-test predicate.
  - `nextFireAt(lastEditTimestamp: number, debounceMs: number): number` — pure helper.
  - `IDLE_SAVE_DEBOUNCE_MS` — exported named constant equal to `2000`.
  - MUST NOT import `@tauri-apps/api` or any forbidden API from the canonical purity-audit pattern.

---

## 3. Out-of-Scope (Sprint 2)

The following are explicitly deferred to Sprint 2 and must not appear in any file authored during Sprint 1:

- Svelte components: `EditorPanel.svelte`, `SaveFailureBanner.svelte`, and any `.svelte` file.
- IPC adapter and state channel: `tauriEditorAdapter.ts`, `editorStateChannel.ts`, any call to `@tauri-apps/api`.
- Timer shell: `timerModule.ts`, any call to `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`.
- Clipboard adapter: `clipboardAdapter.ts`, any call to `navigator.clipboard` or Tauri clipboard plugin.
- DOM event handlers: keyboard listener (`keyboardListener.ts`), `oninput`, `onblur`, `onkeydown` event wiring.
- Svelte 5 runes: `$state`, `$effect`, `$derived` — these are component-tier constructs.
- DOM integration tests: `*.dom.vitest.ts` files.
- Any call to `Date.now()`, `new Date()`, `window`, `document`, `navigator`, `globalThis`, `self`, `requestAnimationFrame`, `localStorage`, `fetch`, `XMLHttpRequest`, `import.meta`, `Math.random`, `crypto`, `performance`.

---

## 4. Test Plan

All test files live under `promptnotes/src/lib/editor/__tests__/`.

| Test file | Type | PROP-EDIT / REQ-EDIT / EC-EDIT coverage |
|---|---|---|
| `editorPredicates.test.ts` | Unit (Tier 1, deterministic) | PROP-EDIT-005 (example-based), PROP-EDIT-010 (cancel-idle-timer on NoteFileSaved), PROP-EDIT-011 (BlurEvent-while-saving → commands=[]), PROP-EDIT-031 (exact message strings for all SaveError variants); REQ-EDIT-002, REQ-EDIT-005, REQ-EDIT-008, REQ-EDIT-015, REQ-EDIT-016 |
| `editorPredicates.property.test.ts` | Property (Tier 2, fast-check) | PROP-EDIT-001 (idempotent dirty / NoteFileSaved sets isDirty=false), PROP-EDIT-005 (banner exhaustiveness — never throws, never undefined), PROP-EDIT-006 (copy-enable parity over all body strings and all 5 status values); REQ-EDIT-001, REQ-EDIT-002, REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006 |
| `editorReducer.test.ts` | Unit (Tier 1, deterministic, cross-product) | PROP-EDIT-007 (example-based cross-product), PROP-EDIT-008 (referential transparency examples), PROP-EDIT-010 (NoteFileSaved → cancel-idle-timer + isDirty=false), PROP-EDIT-011 (BlurEvent in saving → commands=[]), PROP-EDIT-040 (DomainSnapshotReceived mirrors S.status/isDirty/currentNoteId/pendingNextNoteId); REQ-EDIT-001, REQ-EDIT-002, REQ-EDIT-005, REQ-EDIT-008, REQ-EDIT-009 through REQ-EDIT-013, REQ-EDIT-014, EC-EDIT-002 |
| `editorReducer.property.test.ts` | Property (Tier 2, fast-check) | PROP-EDIT-002 (source-pass-through over all save-triggering actions), PROP-EDIT-007 (reducer totality over full status×action cross-product), PROP-EDIT-008 (referential transparency over arbitrary states and actions), PROP-EDIT-009 (subsumed by PROP-EDIT-002, no separate test required per RD-015), PROP-EDIT-040 (snapshot mirroring is identity over state fields — property 'snapshot mirroring is identity over state fields' passes ≥100 fast-check runs); REQ-EDIT-014, REQ-EDIT-026, EC-EDIT-001 through EC-EDIT-002 |
| `debounceSchedule.test.ts` | Unit (Tier 1, deterministic) | PROP-EDIT-003 boundary values (exactly at debounceMs, one ms before, one ms after), PROP-EDIT-004 boundary values (blur timestamp before/after pending idle fire time); REQ-EDIT-004, REQ-EDIT-005, REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-001 |
| `debounceSchedule.property.test.ts` | Property (Tier 2, fast-check) | PROP-EDIT-003 (debounce semantics over arbitrary timestamp sequences), PROP-EDIT-004 (blur-cancels-idle over arbitrary timestamp pairs); REQ-EDIT-004, REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-001 |

Run command: `bun run test` inside `promptnotes/` (vitest, both unit and property tests in the same runner).

Coverage command: `bun run test:dom -- --coverage` inside `promptnotes/` (`@vitest/coverage-v8`, provider: `'v8'`, exclude: `**/__tests__/**, **/*.svelte`).

---

## 5. Pass Criteria

| ID | REQ/PROP coverage | Weight | Pass threshold |
|---|---|---|---|
| CRIT-001 | REQ-EDIT-001, REQ-EDIT-002 / PROP-EDIT-001, PROP-EDIT-008 | 0.09 | editorReducer.property.test.ts properties 'idempotent-dirty' and 'referential-transparency' each pass ≥100 fast-check runs; editorReducer.test.ts NoteFileSaved/NoteSaveFailed/NoteBodyEdited assertions pass 100% |
| CRIT-002 | REQ-EDIT-026 / PROP-EDIT-002 | 0.11 | editorReducer.property.test.ts property 'source-pass-through' passes ≥100 fast-check runs; no 'idle','blur','switch','manual' strings appear in any commands[].source |
| CRIT-003 | REQ-EDIT-004, REQ-EDIT-005, EC-EDIT-001 / PROP-EDIT-003 | 0.10 | debounceSchedule.property.test.ts property 'debounce-semantics' passes ≥100 fast-check runs; debounceSchedule.test.ts all boundary assertions pass 100%; IDLE_SAVE_DEBOUNCE_MS===2000 |
| CRIT-004 | REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-002 / PROP-EDIT-004, PROP-EDIT-011 | 0.10 | debounceSchedule.property.test.ts property 'blur-cancels-idle' passes ≥100 fast-check runs; editorReducer.test.ts BlurEvent-while-saving yields {commands:[]} passes 100% |
| CRIT-005 | REQ-EDIT-015, REQ-EDIT-016 / PROP-EDIT-005, PROP-EDIT-031 | 0.10 | editorPredicates.property.test.ts property 'banner-exhaustiveness' passes ≥100 fast-check runs; editorPredicates.test.ts exact Japanese string assertions for all 4 FsError variants and 2 null-returning validation variants pass 100%; tsc exits 0 |
| CRIT-006 | REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006 / PROP-EDIT-006 | 0.10 | editorPredicates.property.test.ts property 'copy-enable-parity' passes ≥100 fast-check runs over all body strings and all 5 status values |
| CRIT-007 | REQ-EDIT-009 through REQ-EDIT-013 / PROP-EDIT-007 | 0.10 | editorReducer.property.test.ts property 'reducer-totality' passes ≥100 fast-check runs; every returned state.status ∈ 5-variant enum; every commands[].kind ∈ 9-variant EditorCommand union; no throw |
| CRIT-008 | REQ-EDIT-005, REQ-EDIT-002 / PROP-EDIT-010 | 0.08 | editorReducer.test.ts: NoteFileSaved result has isDirty===false, commands contains {kind:'cancel-idle-timer'}, commands contains no {kind:'trigger-idle-save'}; passes 100% |
| CRIT-009 | REQ-EDIT-004 / RD-019 | 0.07 | debounceSchedule.test.ts: computeNextFireAt boundary assertions (at-threshold, one-ms-before, one-ms-after, lastSaveAt>fireAt case) all pass 100%; signature matches {lastEditAt, lastSaveAt, debounceMs, nowMs} exactly |
| CRIT-010 | REQ-EDIT-009 through REQ-EDIT-013, REQ-EDIT-026 / RD-017, RD-018, PROP-EDIT-007 | 0.07 | tsc --noEmit --strict --noUncheckedIndexedAccess exits 0; editorReducer.property.test.ts property 'reducer-totality' confirms all commands[].kind are in the 9-variant set via Set membership; passes ≥100 fast-check runs |
| CRIT-011 | REQ-EDIT-003, REQ-EDIT-004, REQ-EDIT-006 / RD-006, RD-013 | 0.05 | editorPredicates.test.ts: classifySource('idle')==='capture-idle' and classifySource('blur')==='capture-blur' pass 100%; Phase 5 canonical purity grep returns zero hits on editorPredicates.ts, editorReducer.ts, debounceSchedule.ts |
| CRIT-012 | REQ-EDIT-014 / PROP-EDIT-040 | 0.03 | editorReducer.test.ts assertion 'DomainSnapshotReceived mirrors S.status/isDirty/currentNoteId/pendingNextNoteId' passes 100%; editorReducer.property.test.ts property 'snapshot mirroring is identity over state fields' passes ≥100 fast-check runs |

**Weight total: 0.09 + 0.11 + 0.10 + 0.10 + 0.10 + 0.10 + 0.10 + 0.08 + 0.07 + 0.07 + 0.05 + 0.03 = 1.00**

---

## 6. Forbidden in This Sprint

The following MUST NOT appear in any file authored during Sprint 1. The Phase 5 canonical purity-audit grep (pattern from `verification-architecture.md §2`) enforces this for pure modules; the sprint adversary will also check test files for accidental impure imports.

The canonical purity-audit grep pattern (verbatim from `verification-architecture.md §2`) is:

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

Every token in that pattern is forbidden independently. In particular:

- `.svelte` files of any kind.
- Any import from `@tauri-apps/api` (neither `invoke` nor `listen` nor any sub-package).
- `invoke(` — any direct `invoke()` call, even if obtained via re-export, alias, or dynamic require without an explicit `@tauri-apps/api` import. Both `@tauri-apps/api` and `invoke(` are separately forbidden tokens in the canonical pattern.
- `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` — timer shell is Sprint 2 (`timerModule.ts`).
- `Date.now()`, `new Date()`, `Date(` — timestamps are supplied as `nowMs: number` by the caller.
- `window`, `document`, `navigator`, `globalThis`, `self` — no DOM or browser global access.
- `$state`, `$effect`, `$derived` runes — Svelte 5 component-tier syntax.
- `Math.random`, `crypto.`, `performance.`, `requestAnimationFrame`, `requestIdleCallback` — non-deterministic APIs.
- `localStorage`, `sessionStorage`, `indexedDB`, `fetch(`, `XMLHttpRequest` — I/O of any kind.
- `import.meta` — module-tier meta access.
- `import { writable } from 'svelte/store'` — Svelte 4 store pattern (PROP-EDIT-036).

---

## 7. Definition of Done

1. All Red tests (6 test files listed in §4) fail before any implementation is written. Red phase evidence records:
   ```text
   new-feature-tests: FAIL
   regression-baseline: PASS
   ```
   followed by the raw failing test output.

2. After Green implementation, all 6 test files pass with 0 failures: `bun run test` inside `promptnotes/` exits 0.

3. Pure-core branch coverage ≥ 95% per file (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) as reported by `bun run test:dom -- --coverage` with `@vitest/coverage-v8`, exclude pattern `**/__tests__/**, **/*.svelte`.

4. Phase 5 canonical purity grep (pattern from `verification-architecture.md §2`) returns zero hits on `editorPredicates.ts`, `editorReducer.ts`, and `debounceSchedule.ts`.

5. `tsc --noEmit --strict --noUncheckedIndexedAccess` inside `promptnotes/` exits 0.

6. `grep -r "from 'svelte/store'" src/lib/editor/` returns zero hits (PROP-EDIT-036).

7. Sprint contract adversary review (fresh context) returns PASS before the Red phase begins.

---

## 8. Sprint Adversary Review Targets

The contract reviewer must confirm all of the following before the Red phase (Phase 2a) begins:

1. **Purity boundary completeness**: Every function exported from the three pure modules is covered by at least one CRIT-NNN entry and at least one test file in §4. No exported function is left without a proof obligation.

2. **PROP-EDIT traceability**: Every PROP-EDIT-XXX with `Required: true` in `verification-architecture.md §4` that belongs to the pure tier (Tier 1 or Tier 2) is cited in at least one CRIT-NNN pass threshold naming the exact test file and property name.

3. **Weight arithmetic**: CRIT-001 through CRIT-012 weights sum to exactly 1.00.

4. **Pass threshold specificity**: Every pass threshold in §5 names the exact test file path and either the vitest test name or the fast-check property name. No threshold uses vague language such as "tests pass."

5. **Forbidden-API completeness**: §6 lists all APIs from the canonical purity-audit pattern in `verification-architecture.md §2`. No forbidden API is omitted.

6. **Out-of-scope accuracy**: §3 explicitly lists all effectful shell modules (`EditorPanel.svelte`, `SaveFailureBanner.svelte`, `tauriEditorAdapter.ts`, `editorStateChannel.ts`, `timerModule.ts`, `clipboardAdapter.ts`, `keyboardListener.ts`) and all DOM integration test files (`*.dom.vitest.ts`). None of these appear in §2 or §4.

7. **EditorCommand union completeness**: CRIT-010 references all 9 variants from `verification-architecture.md §10` by name. The reviewer must confirm the list matches the canonical definition.

8. **Locked signatures**: CRIT-009 references the locked `computeNextFireAt` and `shouldFireIdleSave` signatures from RD-019. The reviewer must confirm the signatures in §2 match `verification-architecture.md §2` and `behavioral-spec.md §12` word-for-word.

---

## CRIT-001

**Underlying REQ**: REQ-EDIT-001 (NoteBodyEdited sets isDirty=true), REQ-EDIT-002 (NoteFileSaved sets isDirty=false; NoteSaveFailed retains isDirty=true).

**PROPs**: PROP-EDIT-001 (idempotent dirty / NoteFileSaved isDirty=false, Tier 2 fast-check), PROP-EDIT-008 (referential transparency, Tier 2 fast-check).

**Test files**: `editorReducer.test.ts` (example-based isDirty transitions), `editorReducer.property.test.ts` (fast-check properties 'idempotent-dirty' and 'referential-transparency').

**Out of scope**: DomainSnapshotReceived field mirroring is separately covered by CRIT-012 and PROP-EDIT-040. DomainSnapshotReceived wiring to the inbound event channel (EditorStateChannel) is Sprint 2. The $effect that dispatches DomainSnapshotReceived is Sprint 2.

---

## CRIT-002

**Underlying REQ**: REQ-EDIT-026 — source literal pass-through contract; 'capture-idle' and 'capture-blur' are the only values; 'idle', 'blur', 'switch', 'manual' are compile errors.

**PROPs**: PROP-EDIT-002 (source-pass-through equality assertion, Tier 2 fast-check); PROP-EDIT-009 is subsumed by PROP-EDIT-002 per RD-015 — no separate test required.

**Test files**: `editorReducer.property.test.ts` (property 'source-pass-through').

**Out of scope**: The runtime Tauri dispatch of save commands is Sprint 2 (tauriEditorAdapter.ts).

---

## CRIT-003

**Underlying REQ**: REQ-EDIT-004 (IDLE_SAVE_DEBOUNCE_MS=2000, debounce reset on each edit), REQ-EDIT-005 (idle timer cancelled on NoteFileSaved), EC-EDIT-001 (rapid-burst: continuous typing for >10s still fires only once after quiescence).

**PROPs**: PROP-EDIT-003 (debounce semantics over arbitrary timestamp sequences, Tier 2 fast-check).

**Test files**: `debounceSchedule.test.ts` (boundary examples), `debounceSchedule.property.test.ts` (property 'debounce-semantics').

**Out of scope**: The actual setTimeout call is timerModule.ts (Sprint 2). The impure shell observing the commands array to call cancelIdleSave is Sprint 2.

---

## CRIT-004

**Underlying REQ**: REQ-EDIT-006 (blur fires TriggerBlurSave and cancels idle timer), REQ-EDIT-007 (blur and idle must not both fire for the same dirty interval), EC-EDIT-002 (blur while status=saving must not dispatch TriggerBlurSave).

**PROPs**: PROP-EDIT-004 (blur-cancels-idle pure schedule model, Tier 2 fast-check), PROP-EDIT-011 (editorReducer BlurEvent in saving returns commands=[], Tier 1 unit).

**Test files**: `debounceSchedule.property.test.ts` (property 'blur-cancels-idle'), `editorReducer.test.ts` (BlurEvent-while-saving assertion).

**Out of scope**: The actual onblur handler dispatching TriggerBlurSave is EditorPanel.svelte (Sprint 2).

---

## CRIT-005

**Underlying REQ**: REQ-EDIT-015 (banner rendered for save-failed), REQ-EDIT-016 (exact Japanese message strings per SaveError variant; null for validation variants; exhaustive switch).

**PROPs**: PROP-EDIT-005 (banner exhaustiveness and totality, Tier 2 fast-check), PROP-EDIT-031 (exact string assertions, Tier 1 unit).

**Test files**: `editorPredicates.test.ts` (PROP-EDIT-031 exact strings), `editorPredicates.property.test.ts` (property 'banner-exhaustiveness').

**Out of scope**: Banner DOM rendering and data-testid="save-failure-banner" are SaveFailureBanner.svelte (Sprint 2).

---

## CRIT-006

**Underlying REQ**: REQ-EDIT-003 (Copy button disabled when isEmptyAfterTrim), REQ-EDIT-022 (Copy button disabled in idle, switching, save-failed regardless of body), EC-EDIT-006 (copy-enable transitions reactively when whitespace-only body gains a non-whitespace character).

**PROPs**: PROP-EDIT-006 (copy-enable parity over all body strings and all 5 status values, Tier 2 fast-check).

**Test files**: `editorPredicates.property.test.ts` (property 'copy-enable-parity').

**Out of scope**: Copy button DOM disabled attribute and aria-disabled="true" rendering are EditorPanel.svelte (Sprint 2); PROP-EDIT-017 is an integration-tier test (Sprint 2).

---

## CRIT-007

**Underlying REQ**: REQ-EDIT-009 (idle state), REQ-EDIT-010 (editing state), REQ-EDIT-011 (saving state), REQ-EDIT-012 (switching state), REQ-EDIT-013 (save-failed state) — the reducer handles all 5 status values correctly across all action inputs.

**PROPs**: PROP-EDIT-007 (reducer totality over full status×action cross-product, Tier 2 fast-check).

**Test files**: `editorReducer.test.ts` (cross-product examples), `editorReducer.property.test.ts` (property 'reducer-totality').

**Out of scope**: DOM rendering of each state's visual affordances (placeholder text, spinner, locked textarea, banner) is EditorPanel.svelte and SaveFailureBanner.svelte (Sprint 2). PROP-EDIT-024 through PROP-EDIT-028 are integration-tier (Sprint 2).

---

## CRIT-008

**Underlying REQ**: REQ-EDIT-005 (idle timer cancelled on successful save), REQ-EDIT-002 (isDirty=false after save success).

**PROPs**: PROP-EDIT-010 (cancel-idle-timer command emitted on NoteFileSaved, Tier 1 unit).

**Test files**: `editorReducer.test.ts` (NoteFileSaved assertion: isDirty===false, commands contains {kind:'cancel-idle-timer'}, commands excludes {kind:'trigger-idle-save'}).

**Out of scope**: The impure shell reacting to {kind:'cancel-idle-timer'} by calling clearTimeout is timerModule.ts (Sprint 2).

---

## CRIT-009

**Underlying REQ**: REQ-EDIT-004 (debounce contract, computeNextFireAt locked signature from RD-019).

**PROPs**: RD-019 (locked signatures), debounceSchedule.test.ts boundary assertions.

**Test files**: `debounceSchedule.test.ts` (boundary assertions: at-threshold, one-ms-before, one-ms-after, save-already-later-than-fireAt).

**Out of scope**: The IDLE_SAVE_DEBOUNCE_MS constant is also verified here (equals 2000); the test that injects it as debounceMs belongs to this sprint.

---

## CRIT-010

**Underlying REQ**: REQ-EDIT-009 through REQ-EDIT-013 (all status values handled), REQ-EDIT-026 (source pass-through enforced by type system).

**PROPs**: RD-017 (9-variant EditorCommand union), RD-018 ('edit-note-body' and 'copy-note-body' payload shapes), PROP-EDIT-007 (totality confirms kind membership).

**Test files**: `editorReducer.property.test.ts` (property 'reducer-totality' with Set membership check on commands[].kind), compile-time via `tsc --strict`.

**Out of scope**: Tier 0 structural-conformance assertions (_AssertEditNoteBodyShape, _AssertCopyNoteBodyShape) in the impure shell are Sprint 2.

---

## CRIT-011

**Underlying REQ**: REQ-EDIT-003 (isEmptyAfterTrim uses ECMAScript trim), REQ-EDIT-004 (classifySource maps timer event kinds to source literals), REQ-EDIT-006 (blur → 'capture-blur').

**PROPs**: RD-006 (trim semantics locked), RD-013 (UI sends raw strings, not branded types).

**Test files**: `editorPredicates.test.ts` (classifySource assertions), Phase 5 purity grep (zero hits on all three pure module files).

**Out of scope**: Rust-side `note.isEmpty()` Unicode-whitespace equivalence is a future Kani property in the backend feature.

---

## CRIT-012

**Underlying REQ**: REQ-EDIT-014 — State Transitions Are Domain-Driven: DomainSnapshotReceived must mirror the inbound snapshot fields into EditorViewState exactly. When the reducer receives `{ kind: 'DomainSnapshotReceived', snapshot: S }`, the resulting state must satisfy `state.status === S.status`, `state.isDirty === S.isDirty`, `state.currentNoteId === S.currentNoteId`, and `state.pendingNextNoteId === S.pendingNextNoteId` with no transformation of any kind.

**PROPs**: PROP-EDIT-040 (snapshot-mirror equality, introduced by FIND-001 remediation — two proof obligations: a deterministic unit assertion and a fast-check property over arbitrary (state, snapshot) pairs).

**Test files**:
- `editorReducer.test.ts` — deterministic unit test named "DomainSnapshotReceived mirrors S.status/isDirty/currentNoteId/pendingNextNoteId": for several representative (state, snapshot) pairs assert all four field equalities pass 100%.
- `editorReducer.property.test.ts` — fast-check property named "snapshot mirroring is identity over state fields": `fc.property(fc.record({...}), fc.record({...}), (s, snapshot) => { const result = editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot }); return result.state.status === snapshot.status && result.state.isDirty === snapshot.isDirty && result.state.currentNoteId === snapshot.currentNoteId && result.state.pendingNextNoteId === snapshot.pendingNextNoteId; })` passes ≥100 fast-check runs.

**Out of scope**: The `$effect` in `EditorPanel.svelte` that subscribes to `editorStateChannel` and dispatches `DomainSnapshotReceived` is Sprint 2. The IPC listener in `editorStateChannel.ts` is Sprint 2.
