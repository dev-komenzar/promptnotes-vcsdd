# Verification Architecture: ui-editor

**Feature**: `ui-editor`
**Phase**: 1b
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)
**Source of truth**:
- `specs/behavioral-spec.md` (REQ-EDIT-001..027, EC-EDIT-001..010)
- `docs/domain/aggregates.md` — `EditingSessionState`, `note.isEmpty()`, `note.bodyForClipboard()`, `SaveError`
- `docs/domain/workflows.md` — Workflow 2 (CaptureAutoSave), Workflow 6 (CopyBody), Workflow 8 (HandleSaveFailure)

---

## 1. Purpose & Scope

This document defines the verification strategy for the `ui-editor` feature as specified in `specs/behavioral-spec.md`. The `ui-editor` feature is an orchestration-only UI layer that translates user events (textarea input, blur, button clicks, keyboard shortcuts) into the domain commands `EditNoteBody`, `TriggerIdleSave`, `TriggerBlurSave`, `CopyNoteBody`, `RequestNewNote`, `RetrySave`, `DiscardCurrentSession`, and `CancelSwitch`, and reflects the resulting `EditingSessionState` transitions back into the Svelte component tree. Because the feature is primarily reactive orchestration, the verification strategy separates the deterministic pure core (state predicates, debounce scheduling logic, save-error message derivation, and a state reducer) from the effectful shell (Svelte component, timer scheduling via `setTimeout`, Tauri IPC adapters, clipboard adapter, and DOM keyboard/focus listeners). All Tier 2 property tests and Tier 3 mutation tests target pure modules exclusively; DOM and IPC behaviours are covered by integration tests using `@testing-library/svelte` and `jsdom`.

---

## 2. Purity Boundary Map

The boundary between the pure core and the effectful shell is defined as follows: a module is **pure** if and only if its exported functions are deterministic, perform no I/O of any kind, do not call `setTimeout`, `clearTimeout`, `Date.now`, `Math.random`, `window.*`, `document.*`, `navigator.*`, or any Tauri `invoke(...)`, and carry no `$state` or `$effect` rune usage. Any module that crosses one of those lines is **impure (effectful)**.

### Pure core modules

| Module | Layer | Reason | Forbidden APIs (must not appear) |
|---|---|---|---|
| `editorPredicates.ts` | pure | Exports `canCopy(body: string, status: EditingSessionState['status']): boolean`, `isDirty(savedBody: string, currentBody: string): boolean`, `bannerMessageFor(error: SaveError): string \| null`, `classifySource(triggerKind: 'idle' \| 'blur'): 'capture-idle' \| 'capture-blur'`. All are closed over their arguments with no external state. MUST NOT import `@tauri-apps/api`. (ref: domain-events.md:115 — only `'capture-idle'` and `'capture-blur'` are in scope for this feature) | `setTimeout`, `clearTimeout`, `Date.now`, `window`, `document`, `navigator`, `invoke`, `@tauri-apps/api`, `$state`, `$effect` |
| `editorReducer.ts` | pure | Exports `editorReducer(state: EditorReducerState, action: EditorAction): EditorReducerState`. Maps the 5 `EditingSessionState.status` values (`idle`, `editing`, `saving`, `switching`, `save-failed`) across the full action alphabet. `isDirty` transitions are: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained (aggregates.md:273–276). Carries no side effects; the impure shell dispatches commands and applies results. MUST NOT import `@tauri-apps/api`. | `setTimeout`, `clearTimeout`, `Date.now`, `window`, `document`, `navigator`, `invoke`, `@tauri-apps/api`, `$state`, `$effect` |
| `debounceSchedule.ts` | pure | Exports `shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean` and `nextFireAt(lastEditTimestamp: number, debounceMs: number): number`. Given a stream of edit timestamps and a quiescence window, returns whether/when an idle save should fire. The actual `setTimeout` call lives in the impure shell. MUST NOT import `@tauri-apps/api`. | `setTimeout`, `clearTimeout`, `Date.now`, `window`, `document`, `navigator`, `invoke`, `@tauri-apps/api`, `$state`, `$effect` |

### Effectful shell modules

| Module | Layer | Reason | Forbidden APIs (for pure rows) |
|---|---|---|---|
| `EditorPanel.svelte` | impure | Svelte 5 component: uses `$state`, `$derived`, `$effect`, `bind:value`, DOM event handlers (`oninput`, `onblur`, `onkeydown`). Mounts/unmounts with the component lifecycle. | n/a |
| `SaveFailureBanner.svelte` | impure | Svelte 5 component: renders conditional DOM based on `EditingSessionState.status === 'save-failed'`. Owns the Retry/Discard/Cancel click handlers. | n/a |
| `timerModule.ts` | impure | Thin wrapper: `scheduleIdleSave(delayMs, callback): TimerHandle` and `cancelIdleSave(handle: TimerHandle): void`. Wraps `setTimeout` / `clearTimeout`. Injected as a dependency so tests can substitute a fake. | n/a |
| `clipboardAdapter.ts` | impure | Wraps `navigator.clipboard.writeText(text)` (or Tauri clipboard plugin if available). Produces `Promise<void>`. | n/a |
| `tauriEditorAdapter.ts` | impure | Concrete implementation of the `EditorIpcAdapter` interface. Wraps Tauri `invoke(...)` calls when the backend save-handler feature is implemented. Concrete snake_case command names follow the existing convention (`invoke_configure_vault`, `settings_save`, `fs_*`) but are deferred to the backend save-handler VCSDD feature — they are NOT part of this feature's contract. Integration tests inject a mock adapter, never the real `invoke()`. (ref: behavioral-spec.md §9 RD-003) | n/a |
| `keyboardListener.ts` | impure | Registers `document.addEventListener('keydown', ...)` for the Ctrl+N / Cmd+N shortcut (both platforms via `event.ctrlKey \|\| event.metaKey`). Dispatches `RequestNewNote { source: 'ctrl-N' }` regardless of platform — the source enum label is semantic, not literal. Teardown via returned cleanup function, called from `$effect` return. (ref: behavioral-spec.md §9 RD-004; REQ-EDIT-024) | n/a |

---

## 3. Verification Tier Assignments

### Tier 0 — Type-level / static guarantees (TypeScript compile-time)

Compile-time proofs require no test execution; they are enforced by `tsc --noEmit` in CI.

- **Exhaustive switch on `EditingSessionState.status`**: Any switch in `editorReducer.ts` and `EditorPanel.svelte` that branches on `status` must include a `never`-check default branch. If a new status value is added to `EditingSessionState` without updating the switch, the TypeScript compiler produces a type error.
- **Exhaustive switch on `SaveError.kind`** (and nested `reason.kind`): `bannerMessageFor` in `editorPredicates.ts` must cover all variants of `SaveError` — `{ kind: 'fs', reason: FsError }` and `{ kind: 'validation', reason: SaveValidationError }` — via exhaustive switch. Unhandled variants produce a compile-time `never` error.
- **Branded `SaveSource` type**: The `source` field on save commands produced by `ui-editor` uses the string literal union `'capture-idle' | 'capture-blur'` (drawn verbatim from the domain enum in domain-events.md:115). TypeScript enforces that `classifySource` returns only members of this union; passing `'idle'`, `'blur'`, `'switch'`, `'manual'`, or any other string is a compile error. (ref: behavioral-spec.md §9 RD-001)
- **`EditorAction` discriminated union**: `editorReducer.ts` accepts `EditorAction` — a discriminated union covering all possible UI-triggered actions. Adding a new action without handling it in the reducer switch is a compile-time error (exhaustive `never` branch required).

### Tier 1 — Pure unit tests (vitest, deterministic)

These tests call pure functions directly with controlled inputs. No fake timers, no mocks required.

- `editorPredicates.test.ts`: Example-based tests for every branch of `canCopy`, `isDirty`, `bannerMessageFor`, and `classifySource`.
- `editorReducer.test.ts`: Example-based tests for all (status, action) pairs in the state transition table from `aggregates.md §CaptureSession`.
- `debounceSchedule.test.ts`: Example-based tests for `shouldFireIdleSave` and `nextFireAt` at boundary inputs (exactly at debounce threshold, one millisecond before, one after).

### Tier 2 — Property tests (fast-check, pure modules only)

Property tests generate randomised inputs via `fast-check` and assert invariants that must hold for all inputs within the domain.

- **PROP-EDIT-001** (`editorPredicates.ts`): Idempotent dirty detection — `isDirty(body, body)` is always `false` regardless of the body string.
- **PROP-EDIT-003** (`debounceSchedule.ts`): Debounce semantics — given any sequence of edit timestamps with quiescence of at least `debounceMs` before `nowMs`, `shouldFireIdleSave` returns `true`.
- **PROP-EDIT-004** (`debounceSchedule.ts`): Blur-cancels-idle — pure model version: given the last-blur timestamp `tb` is before a pending idle fire time `ts`, the schedule model reports that the blur save takes precedence.
- **PROP-EDIT-005** (`editorPredicates.ts`): Banner exhaustiveness — `bannerMessageFor` returns a non-empty string for every `{ kind: 'fs', reason: _ }` variant and `null` for every `{ kind: 'validation', reason: _ }` variant.
- **PROP-EDIT-006** (`editorPredicates.ts`): Copy-enable parity — `canCopy(body, 'editing')` is `true` iff `body.trim().length > 0`.
- **PROP-EDIT-007** (`editorReducer.ts`): Reducer totality — for all (status, action) pairs in the cross-product, `editorReducer` returns a defined `EditingSessionState`-compatible object and never throws.
- **PROP-EDIT-008** (`editorReducer.ts`): Reducer purity — calling `editorReducer(state, action)` twice with identical `(state, action)` always yields deep-equal results.
- **PROP-EDIT-009** (`editorReducer.ts`): Source field origin — every save command produced by the reducer carries the `source` value passed in by the action payload unchanged.

### Tier 3 — Mutation tests (Stryker)

Mutation testing targets the pure core to verify that the test suite can detect semantic bugs introduced by Stryker's mutations (operator replacement, conditional inversion, string/constant replacement, etc.).

Scope: `promptnotes/src/lib/editor/editorPredicates.ts`, `promptnotes/src/lib/editor/editorReducer.ts`, `promptnotes/src/lib/editor/debounceSchedule.ts`.

Target mutation score: **≥ 80%** for each file in strict mode.

Config file: `promptnotes/stryker.conf.mjs` with `mutate` scoped to `src/lib/editor/editorPredicates.ts`, `src/lib/editor/editorReducer.ts`, `src/lib/editor/debounceSchedule.ts`.

### Integration tier — `@testing-library/svelte` + `jsdom`

Integration tests verify the wiring between the pure core and the effectful shell. These are not proof obligations but are required to bridge the two layers. They cover DOM-level assertions: element presence, `data-testid` attributes, `aria-*` attributes, `disabled` state, and event dispatch counts (using `vi.fn()` spies injected via props).

Files: `promptnotes/src/lib/editor/__tests__/*.component.test.ts`

Notable responsibilities of the integration tier:
- Focus placement on mount (REQ-EDIT-009 placeholder, REQ-EDIT-010 auto-focus).
- Textarea `disabled` / `readonly` transitions across all 5 `EditingSessionState.status` values.
- Banner DOM presence and absence keyed on `status === 'save-failed'`.
- Retry / Discard / Cancel button click dispatch counts.
- Copy button `disabled` attribute toggling on body content changes.
- Ctrl+N keyboard shortcut with `event.preventDefault()` assertion.
- `vi.useFakeTimers()` scenarios for idle debounce (REQ-EDIT-004, EC-EDIT-001).
- Blur-during-saving guard (EC-EDIT-002): `TriggerBlurSave` not dispatched when `status === 'saving'`.

---

## 4. Proof Obligations

The following table contains one `PROP-EDIT-XXX` entry for every REQ-EDIT-001..027 from Phase 1a. Where two requirements describe the same property from complementary angles, they are merged into a single PROP with both REQ IDs cited. Where a requirement is inherently integration-tier (DOM focus events, button click dispatch, ARIA attribute placement), `Required` is set to `false` and the integration test path is cited.

| PROP-ID | Requirement (REQ-EDIT-XXX) | Property Statement | Tier | Tool | Required | Pure-or-Shell |
|---|---|---|---|---|---|---|
| PROP-EDIT-001 | REQ-EDIT-001, REQ-EDIT-002 | `isDirty(body, body)` returns `false` for all string values of `body` (idempotent dirty: equal bodies are never dirty). Complementary: after a save-success action, `editorReducer` returns a state with `isDirty === false`. | 2 | fast-check | true | pure |
| PROP-EDIT-002 | REQ-EDIT-026 | Every save command produced by `editorReducer` carries a `source` field drawn exclusively from `'capture-idle' \| 'capture-blur'` (the only two values in scope for `ui-editor` per domain-events.md:115), and the value equals the `source` passed in the triggering action payload. The UI layer never omits, infers, or uses `'idle'`, `'blur'`, `'switch'`, `'manual'`, or any other string. (ref: behavioral-spec.md §9 RD-001) | 2 | fast-check | true | pure |
| PROP-EDIT-003 | REQ-EDIT-004, EC-EDIT-001 | Given any sequence of edit timestamps `{t1, ..., tn}` where `tn + debounceMs ≤ nowMs` and no edit occurs in `(tn, nowMs)`, `shouldFireIdleSave` returns `true` and `nextFireAt` returns `tn + debounceMs`. For rapid bursts (any edit within the debounce window), `shouldFireIdleSave` returns `false`. | 2 | fast-check | true | pure |
| PROP-EDIT-004 | REQ-EDIT-006, REQ-EDIT-007 | In the pure debounce schedule model: if a blur event is recorded at time `tb` while a pending idle save is scheduled for `ts > tb`, the schedule model reports that the idle save should NOT fire at `ts`; only the blur save should be emitted. Blur and idle saves do not both fire for the same dirty interval. | 2 | fast-check | true | pure |
| PROP-EDIT-005 | REQ-EDIT-015, REQ-EDIT-016 | `bannerMessageFor(error)` returns a non-empty string for every `SaveError` with `kind === 'fs'` (all four `FsError` reason variants: `permission`, `disk-full`, `lock`, `unknown`). `bannerMessageFor` returns `null` for every `SaveError` with `kind === 'validation'` (both `empty-body-on-idle` and `invariant-violated`). The function is total: it never throws and never returns `undefined`. | 2 | fast-check + tsc exhaustive switch | true | pure |
| PROP-EDIT-006 | REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006 | `canCopy(body, status)` is `true` iff `body.trim().length > 0` AND `status` is one of `'editing' \| 'saving'`. For `status ∈ {'idle', 'switching', 'save-failed'}`, `canCopy` is always `false` regardless of body content. Tested over randomly generated body strings and all 5 status values. | 2 | fast-check | true | pure |
| PROP-EDIT-007 | REQ-EDIT-009, REQ-EDIT-010, REQ-EDIT-011, REQ-EDIT-012, REQ-EDIT-013 | `editorReducer(state, action)` returns a defined, well-formed `EditorReducerState` object for every (status, action) pair in the full cross-product. The function never throws, never returns `undefined`, and never produces a `status` value outside the 5-value enum. `isDirty` is a property of `EditorReducerState` (owned by the pure reducer, not by the Svelte component); its transitions are: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained. (ref: aggregates.md:258,273–276; behavioral-spec.md §9 RD-005) | 2 | fast-check | true | pure |
| PROP-EDIT-008 | REQ-EDIT-014 | Calling `editorReducer(state, action)` twice with identical `(state, action)` arguments (same reference or deep-equal) always produces deep-equal `nextState`. The reducer is referentially transparent: no global mutable state, no `Date.now`, no randomness. `isDirty` transitions are synchronous and deterministic — no Tauri round-trip is needed to update `isDirty`. (ref: aggregates.md:273–276; behavioral-spec.md §9 RD-005) | 2 | fast-check | true | pure |
| PROP-EDIT-009 | REQ-EDIT-026 | Every `SaveNoteRequested`-equivalent action dispatched through `editorReducer` carries the `source` value that was present in the action's payload, unchanged. The reducer does not infer, transform, or default the source field. The `source` value in the produced command is always one of `'capture-idle' \| 'capture-blur'`; any other value is a type error at the action construction site. (ref: domain-events.md:115; behavioral-spec.md §9 RD-001) | 2 | fast-check | true | pure |
| PROP-EDIT-010 | REQ-EDIT-005, REQ-EDIT-002 | After a `SaveSuccess` action, `editorReducer` transitions the state such that `isDirty === false` and any pending idle timer intent (captured in reducer state as a flag/handle marker) is cleared. The idle-timer-cancel decision is pure; the actual `clearTimeout` call happens in the effectful shell reacting to the reducer output. | 1 | vitest | true | pure |
| PROP-EDIT-011 | REQ-EDIT-008, EC-EDIT-002 | `editorReducer` applied to `(state_with_status_saving, BlurEvent)` returns a state with `status === 'saving'` and does not produce a `TriggerBlurSave` command intent. The guard is encoded in the pure reducer, not in the Svelte event handler. | 1 | vitest | true | pure |
| PROP-EDIT-012 | REQ-EDIT-017 | Activating the Retry button in `status === 'save-failed'` dispatches `RetrySave` exactly once. The banner disappears when domain state transitions to `saving`. | Integration | @testing-library/svelte | false | shell — integration test: `save-failure-banner.component.test.ts` |
| PROP-EDIT-013 | REQ-EDIT-018 | Activating the Discard button dispatches `DiscardCurrentSession` exactly once. | Integration | @testing-library/svelte | false | shell — integration test: `save-failure-banner.component.test.ts` |
| PROP-EDIT-014 | REQ-EDIT-019 | Activating the Cancel button dispatches `CancelSwitch` exactly once. The banner disappears when domain state transitions to `editing`. | Integration | @testing-library/svelte | false | shell — integration test: `save-failure-banner.component.test.ts` |
| PROP-EDIT-015 | REQ-EDIT-020, NFR-EDIT-007 | The save-failure banner container has `box-shadow` exactly matching the 5-layer Deep Shadow string; the left accent border uses `#dd5b00`; `border-radius` is 8px. Button typography uses `font-size: 15px; font-weight: 600`. All color/spacing tokens are in the DESIGN.md §10 allow-list. | Integration + style audit | @testing-library/svelte + design-token audit script | false | shell — integration test: `save-failure-banner.component.test.ts` + `design-tokens.audit.test.ts` |
| PROP-EDIT-016 | REQ-EDIT-021 | Copy button click dispatches `CopyNoteBody` with the current `noteId` when `canCopy === true`. No dispatch when `canCopy === false`. | Integration | @testing-library/svelte | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-017 | REQ-EDIT-022 | Copy button has `disabled` attribute and `aria-disabled="true"` in `idle`, `switching`, `save-failed` states and when body is whitespace-only. Text color is `#a39e98` in disabled state. | Integration | @testing-library/svelte | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-018 | REQ-EDIT-023 | "+ 新規" button click dispatches `RequestNewNote` with `source: "explicit-button"` and `issuedAt` set. | Integration | @testing-library/svelte | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-019 | REQ-EDIT-024, EC-EDIT-007 | Ctrl+N keydown event dispatches `RequestNewNote` with `source: "ctrl-N"`, calls `event.preventDefault()`, and does not insert the character `N` into the textarea. | Integration | @testing-library/svelte + jsdom keyboard simulation | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-020 | REQ-EDIT-025, EC-EDIT-007, EC-EDIT-008, EC-EDIT-010 | When `RequestNewNote` is dispatched while `isDirty === true`, `TriggerBlurSave` is dispatched before any new-note intent is processed. `RequestNewNote` is not processed until the domain transitions out of `saving`. In `save-failed` state, Ctrl+N dispatches the command and defers to domain response. | Integration | @testing-library/svelte | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-021 | REQ-EDIT-001 | Each textarea `input` event dispatches `EditNoteBody` carrying the full current body string and sets `isDirty` to `true` in the derived state. | Integration | @testing-library/svelte | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-022 | REQ-EDIT-006, EC-EDIT-002 | Textarea blur event while `isDirty === true` dispatches `TriggerBlurSave { source: "blur" }` exactly once and cancels any pending idle timer (spy on `timerModule.cancelIdleSave`). Blur while `status === 'saving'` dispatches nothing. | Integration | @testing-library/svelte + `vi.useFakeTimers()` | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-023 | REQ-EDIT-004, EC-EDIT-001 | With `vi.useFakeTimers()`: after the last `EditNoteBody` dispatch, advancing time by exactly `IDLE_SAVE_DEBOUNCE_MS` (2000ms) fires `TriggerIdleSave { source: "idle" }` exactly once. Advancing time by `IDLE_SAVE_DEBOUNCE_MS - 1` fires nothing. During a continuous burst, each new input resets the timer and no intermediate fire occurs. | Integration | @testing-library/svelte + `vi.useFakeTimers()` | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-024 | REQ-EDIT-009 | In `status === 'idle'`: the Body textarea is `readonly` or absent from the DOM; Copy button has `disabled` and `aria-disabled="true"`; a placeholder message is present; New Note button is enabled. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |
| PROP-EDIT-025 | REQ-EDIT-010 | In `status === 'editing'` with `isDirty === true`: textarea accepts input; a dirty indicator element is present in the DOM; Copy button is enabled when `body.trim().length > 0`; no error banner present. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |
| PROP-EDIT-026 | REQ-EDIT-011 | In `status === 'saving'`: a save-in-progress indicator with `aria-label` containing "保存中" is present; textarea is not `disabled` and not `readonly`; `role="status"` is present on the indicator element. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |
| PROP-EDIT-027 | REQ-EDIT-012 | In `status === 'switching'`: textarea is `disabled` or `aria-disabled="true"`; Copy button is disabled; a visual cue element indicating pending switch is present. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |
| PROP-EDIT-028 | REQ-EDIT-013 | In `status === 'save-failed'`: save-failure banner is visible (`data-testid="save-failure-banner"`); textarea accepts input; Copy button is disabled. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |
| PROP-EDIT-029 | REQ-EDIT-014 | No Svelte component in `ui-editor` imports a writable `EditingSessionState` setter or constructs an `EditingSessionState` object directly. The store is read-only from the component's perspective. | 0 | ESLint architecture rule (no-direct-session-state-write) | true | pure/shell boundary — lint CI |
| PROP-EDIT-030 | REQ-EDIT-015 | The save-failure banner is present in the DOM when `status === 'save-failed'` and absent in all other states. The banner root element has `role="alert"` and `data-testid="save-failure-banner"`. | Integration | @testing-library/svelte | false | shell — integration test: `save-failure-banner.component.test.ts` |
| PROP-EDIT-031 | REQ-EDIT-016 | `bannerMessageFor({ kind: 'fs', reason: { kind: 'permission' } })` returns `'保存に失敗しました（権限不足）'`. Equivalent assertions for `disk-full`, `lock`, `unknown`. `bannerMessageFor({ kind: 'validation', ... })` returns `null`. The TypeScript switch is exhaustive (compile-time). | 1 | vitest | true | pure |
| PROP-EDIT-032 | REQ-EDIT-027 | When `EditingSessionState` carries a `SaveValidationError.kind === 'invariant-violated'`, no inline error message is rendered in the editor UI and `console.error` is called. When `kind === 'empty-body-on-idle'`, no inline error is shown. Textarea is never `disabled` due to a validation error alone. | Integration | @testing-library/svelte | false | shell — integration test: `editor-validation.component.test.ts` |
| PROP-EDIT-033 | NFR-EDIT-001, NFR-EDIT-002 | All interactive elements (textarea, Copy button, New Note button, Retry, Discard, Cancel) have non-negative `tabIndex` when enabled. Saving indicator has `role="status"`. Banner has `role="alert"`. Focus ring uses `2px solid #097fe8`. | Integration | @testing-library/svelte + axe-core (accessibility audit) | false | shell — integration test: `editor-accessibility.component.test.ts` |
| PROP-EDIT-034 | NFR-EDIT-003, NFR-EDIT-004, EC-EDIT-009 | The idle debounce timer uses a single handle per edit cycle (spy on `timerModule.scheduleIdleSave` call count per burst). The `oninput` handler completes synchronously without `await`. OS-sleep/resume scenario (EC-EDIT-009) is accepted as environment-dependent and covered only by the timer mock test (PROP-EDIT-023). | Integration | @testing-library/svelte + `vi.useFakeTimers()` | false | shell — integration test: `editor-panel.component.test.ts` |
| PROP-EDIT-035 | NFR-EDIT-005, NFR-EDIT-006, NFR-EDIT-007 | All hex / rgba / px values in `ui-editor` component and TypeScript files are members of the DESIGN.md §10 Token Reference allow-list. Button text is `font-size: 15px; font-weight: 600`. No `font-weight` value outside `{400, 500, 600, 700}`. | 3 (style audit) | design-token audit CI script | false | shell — `design-tokens.audit.test.ts` |
| PROP-EDIT-036 | NFR-EDIT-008 | No `import { writable } from 'svelte/store'` exists in any `ui-editor` component file for editor-internal state. All local state uses `$state(...)`. `EditingSessionState` is not mutated inside any component. | 0 | ESLint rule (no-svelte4-writable-for-editor) | true | pure/shell boundary — lint CI |
| PROP-EDIT-037 | EC-EDIT-003 | In `status === 'save-failed'`, continued textarea input continues to dispatch `EditNoteBody` and the banner remains visible. The idle debounce timer continues to run. `isDirty` remains `true`. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |
| PROP-EDIT-038 | EC-EDIT-004 | `DiscardCurrentSession` dispatched from the banner propagates to the domain adapter regardless of the current save in-flight status. The UI does not cancel the Tauri IPC call; it only dispatches the command and reflects the returned state. | Integration | @testing-library/svelte | false | shell — integration test: `save-failure-banner.component.test.ts` |
| PROP-EDIT-039 | EC-EDIT-005 | In `status === 'switching'` (driven by domain state change): textarea is locked (REQ-EDIT-012 / PROP-EDIT-027); idle timer is cancelled (spy on `timerModule.cancelIdleSave`). When domain transitions to `editing` with new note content, textarea is re-enabled. | Integration | @testing-library/svelte | false | shell — integration test: `editor-session-state.component.test.ts` |

---

## 5. Tooling Map

### Pure unit tests

Path pattern: `promptnotes/src/lib/editor/__tests__/*.test.ts`

Files:
- `promptnotes/src/lib/editor/__tests__/editorPredicates.test.ts` — Tier 1, covers PROP-EDIT-005 (example-based), PROP-EDIT-010, PROP-EDIT-011, PROP-EDIT-031
- `promptnotes/src/lib/editor/__tests__/editorReducer.test.ts` — Tier 1, covers PROP-EDIT-007 (example cross-product), PROP-EDIT-008, PROP-EDIT-010, PROP-EDIT-011
- `promptnotes/src/lib/editor/__tests__/debounceSchedule.test.ts` — Tier 1, covers PROP-EDIT-003 and PROP-EDIT-004 boundary values

Run command: `bun run test` (vitest) inside `promptnotes/`

### Property tests (fast-check)

Path pattern: `promptnotes/src/lib/editor/__tests__/*.property.test.ts`

Files:
- `promptnotes/src/lib/editor/__tests__/editorPredicates.property.test.ts` — PROP-EDIT-001, PROP-EDIT-005, PROP-EDIT-006
- `promptnotes/src/lib/editor/__tests__/editorReducer.property.test.ts` — PROP-EDIT-002, PROP-EDIT-007, PROP-EDIT-008, PROP-EDIT-009
- `promptnotes/src/lib/editor/__tests__/debounceSchedule.property.test.ts` — PROP-EDIT-003, PROP-EDIT-004

Run command: `bun run test` (vitest, same runner — fast-check tests are co-located with vitest)

### Component / integration tests

Path pattern: `promptnotes/src/lib/editor/__tests__/*.component.test.ts`

Files:
- `promptnotes/src/lib/editor/__tests__/editor-panel.component.test.ts` — PROP-EDIT-016 through PROP-EDIT-023, PROP-EDIT-034
- `promptnotes/src/lib/editor/__tests__/editor-session-state.component.test.ts` — PROP-EDIT-024 through PROP-EDIT-028, PROP-EDIT-037, PROP-EDIT-039
- `promptnotes/src/lib/editor/__tests__/save-failure-banner.component.test.ts` — PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-015, PROP-EDIT-030, PROP-EDIT-038
- `promptnotes/src/lib/editor/__tests__/editor-validation.component.test.ts` — PROP-EDIT-032
- `promptnotes/src/lib/editor/__tests__/editor-accessibility.component.test.ts` — PROP-EDIT-033

Test environment: `@testing-library/svelte` + `jsdom` + `vi.useFakeTimers()` for timer scenarios

Run command: `bun run test` (vitest) inside `promptnotes/`

### Mutation testing (Stryker)

Config: `promptnotes/stryker.conf.mjs`

Mutation scope (pure modules only):
```
src/lib/editor/editorPredicates.ts
src/lib/editor/editorReducer.ts
src/lib/editor/debounceSchedule.ts
```

Run command: `bunx stryker run` inside `promptnotes/`

Target mutation score: **≥ 80%** per file.

### Static / lint checks

- `tsc --noEmit` inside `promptnotes/` — enforces Tier 0 exhaustive switch guarantees (PROP-EDIT-005 compile-time, PROP-EDIT-036 partial)
- ESLint with custom rules:
  - `no-direct-session-state-write` (PROP-EDIT-029): disallows direct mutation of `EditingSessionState` from component files
  - `no-svelte4-writable-for-editor` (PROP-EDIT-036): disallows `import { writable } from 'svelte/store'` in `src/lib/editor/**`
- Design-token audit script: `promptnotes/scripts/audit-design-tokens.ts` run via `bun run audit:tokens` — covers PROP-EDIT-035

---

## 6. Coverage Matrix

Every REQ-EDIT-001..027 and EC-EDIT-001..010 must appear in the following table.

| ID | PROP-EDIT-XXX | Tier | Test path |
|---|---|---|---|
| REQ-EDIT-001 | PROP-EDIT-001 (pure), PROP-EDIT-021 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-002 | PROP-EDIT-001 (pure), PROP-EDIT-010 (pure) | 1 + 2 | `editorPredicates.property.test.ts`, `editorReducer.test.ts` |
| REQ-EDIT-003 | PROP-EDIT-006 (pure), PROP-EDIT-017 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-004 | PROP-EDIT-003 (pure), PROP-EDIT-023 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-005 | PROP-EDIT-010 | 1 | `editorReducer.test.ts` |
| REQ-EDIT-006 | PROP-EDIT-004 (pure), PROP-EDIT-022 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-007 | PROP-EDIT-004 (pure), PROP-EDIT-022 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-008 | PROP-EDIT-011 (pure), PROP-EDIT-022 (integration) | 1 + Integration | `editorReducer.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-009 | PROP-EDIT-024 | Integration | `editor-session-state.component.test.ts` |
| REQ-EDIT-010 | PROP-EDIT-025 | Integration | `editor-session-state.component.test.ts` |
| REQ-EDIT-011 | PROP-EDIT-026 | Integration | `editor-session-state.component.test.ts` |
| REQ-EDIT-012 | PROP-EDIT-027 | Integration | `editor-session-state.component.test.ts` |
| REQ-EDIT-013 | PROP-EDIT-028 | Integration | `editor-session-state.component.test.ts` |
| REQ-EDIT-014 | PROP-EDIT-029 | 0 (lint) | ESLint CI — `no-direct-session-state-write` |
| REQ-EDIT-015 | PROP-EDIT-030 | Integration | `save-failure-banner.component.test.ts` |
| REQ-EDIT-016 | PROP-EDIT-005 (pure), PROP-EDIT-031 (pure) | 1 + 2 | `editorPredicates.test.ts`, `editorPredicates.property.test.ts` |
| REQ-EDIT-017 | PROP-EDIT-012 | Integration | `save-failure-banner.component.test.ts` |
| REQ-EDIT-018 | PROP-EDIT-013 | Integration | `save-failure-banner.component.test.ts` |
| REQ-EDIT-019 | PROP-EDIT-014 | Integration | `save-failure-banner.component.test.ts` |
| REQ-EDIT-020 | PROP-EDIT-015 | Integration + style audit | `save-failure-banner.component.test.ts`, `design-tokens.audit.test.ts` |
| REQ-EDIT-021 | PROP-EDIT-016 | Integration | `editor-panel.component.test.ts` |
| REQ-EDIT-022 | PROP-EDIT-006 (pure), PROP-EDIT-017 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.component.test.ts` |
| REQ-EDIT-023 | PROP-EDIT-018 | Integration | `editor-panel.component.test.ts` |
| REQ-EDIT-024 | PROP-EDIT-019 | Integration | `editor-panel.component.test.ts` |
| REQ-EDIT-025 | PROP-EDIT-020 | Integration | `editor-panel.component.test.ts` |
| REQ-EDIT-026 | PROP-EDIT-002, PROP-EDIT-009 | 2 | `editorReducer.property.test.ts` |
| REQ-EDIT-027 | PROP-EDIT-032 | Integration | `editor-validation.component.test.ts` |
| EC-EDIT-001 | PROP-EDIT-003, PROP-EDIT-023 | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.component.test.ts` |
| EC-EDIT-002 | PROP-EDIT-011, PROP-EDIT-022 | 1 + Integration | `editorReducer.test.ts`, `editor-panel.component.test.ts` |
| EC-EDIT-003 | PROP-EDIT-037 | Integration | `editor-session-state.component.test.ts` |
| EC-EDIT-004 | PROP-EDIT-038 | Integration | `save-failure-banner.component.test.ts` |
| EC-EDIT-005 | PROP-EDIT-039 | Integration | `editor-session-state.component.test.ts` |
| EC-EDIT-006 | PROP-EDIT-006, PROP-EDIT-017 | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.component.test.ts` |
| EC-EDIT-007 | PROP-EDIT-019, PROP-EDIT-020 | Integration | `editor-panel.component.test.ts` |
| EC-EDIT-008 | PROP-EDIT-020 | Integration | `editor-panel.component.test.ts` |
| EC-EDIT-009 | PROP-EDIT-034 (timer mock covers fire-on-resume semantics within test scope) | Integration | `editor-panel.component.test.ts` |
| EC-EDIT-010 | PROP-EDIT-020 | Integration | `editor-panel.component.test.ts` |

---

## 7. Verification Gates

### Phase 2 gate (Red phase entry criterion)

Before any implementation file is written:
- Every `PROP-EDIT-XXX` with `Required: true` must have a corresponding failing test in the appropriate test file.
- The regression baseline (all pre-existing tests from `ui-app-shell` and other features) must remain green.
- Red phase evidence must record:
  ```text
  new-feature-tests: FAIL
  regression-baseline: PASS
  ```
  followed by the raw failing test output.

Integration-tier tests (those with `Required: false`) must also be written in the Red phase before any implementation; they are not proof obligations but are still subject to the Red-before-Green rule.

### Phase 3 gate (adversarial review criterion)

- 100% branch coverage of the pure core (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) as reported by vitest's `--coverage` flag.
- 100% of `PROP-EDIT-XXX` with `Required: true` must pass.
- All integration-tier tests must pass.

### Phase 5 gate (formal hardening criterion)

- **Stryker mutation score**: ≥ 80% on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`.
- **Security audit**: grep for `{@html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` inside `src/lib/editor/**` must return zero hits. No user-supplied body content is rendered via HTML injection.
- **Purity audit**: grep for `setTimeout|setInterval|Date\.now|window\.|document\.|navigator\.|invoke\(|@tauri-apps/api` inside `src/lib/editor/editorPredicates.ts`, `src/lib/editor/editorReducer.ts`, and `src/lib/editor/debounceSchedule.ts` must return zero hits. Pure-tier modules MUST NOT import `@tauri-apps/api` under any circumstances. (ref: behavioral-spec.md §9 RD-003)
- **Lint gates**: `no-direct-session-state-write` and `no-svelte4-writable-for-editor` ESLint rules must report zero violations.
- **Design-token audit**: `bun run audit:tokens` must report zero out-of-allow-list values.

---

## 8. Threat Model & Security Properties

### Body content trust boundary

The `body` field is raw user-supplied text. It is displayed in the editor textarea and copied to the clipboard. Svelte text bindings (`{body}`, `bind:value`) escape HTML by default, which prevents reflected XSS in the Svelte template layer.

**Prohibition**: The `{@html body}` directive must never be used anywhere in `ui-editor` components to display editor body content. The Phase 5 purity audit grep (`{@html`) will catch any violation.

The `data-testid` attributes and ARIA labels are hard-coded string literals; they never interpolate user data.

### Clipboard surface

When `CopyNoteBody` writes `note.bodyForClipboard()` to the clipboard, the content is the raw body string including any control characters or very long content. This is intentional and acceptable: the clipboard is a direct user action, and no sanitisation is applied. The domain's `bodyForClipboard()` method (as specified in `aggregates.md`) guarantees only that frontmatter is excluded; it makes no further transformations.

### Tauri IPC

The `tauriEditorAdapter.ts` module is the sole entry point for all Tauri `invoke(...)` calls from the editor, and it implements the `EditorIpcAdapter` interface. **The `ui-editor` feature does NOT define or hard-code Tauri command name strings.** Concrete IPC wiring (snake_case command names) is deferred to the backend save-handler VCSDD feature when the Rust command handlers are implemented. (ref: behavioral-spec.md §9 RD-003)

**Phase 5 purity audit note**: pure-tier modules (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) MUST NOT contain any `import` from `@tauri-apps/api`. The Phase 5 grep audit covers this:
```
grep -r "@tauri-apps/api" src/lib/editor/editorPredicates.ts \
  src/lib/editor/editorReducer.ts src/lib/editor/debounceSchedule.ts
# must return zero hits
```

**Integration test adapter contract**: All integration tests inject a mock `EditorIpcAdapter` that records calls via `vi.fn()`. No integration test calls real `invoke()`.

When the backend feature assigns Tauri command names, they will follow the existing snake_case convention (`invoke_configure_vault`, `settings_save`, `fs_*`). Candidate names (informational only, subject to the backend feature's spec) are:

| Domain command | Candidate Tauri `invoke` name (backend feature TBD) |
|---|---|
| `TriggerIdleSave` | `trigger_idle_save` |
| `TriggerBlurSave` | `trigger_blur_save` |
| `CopyNoteBody` | `copy_note_body` |
| `RequestNewNote` | `request_new_note` |
| `RetrySave` | `retry_save` |
| `DiscardCurrentSession` | `discard_current_session` |
| `CancelSwitch` | `cancel_switch` |

No other Tauri command strings shall be invoked from `ui-editor`. The adapter file will be audited in Phase 5 to confirm zero additional `invoke(...)` calls.

All command payloads carry only typed value-object fields defined in `docs/domain/` type contracts; no raw user input is sent as untyped string arguments.

---

## 9. Out-of-Scope for This Feature

The following concerns are explicitly out of scope for `ui-editor` verification and are covered by other VCSDD features or domain layers:

- **Body validation rules** (e.g., maximum length, character restrictions beyond the empty-trim check): these live in the domain's `Body` value object and Rust smart constructors.
- **Note list pane** (feed rows, per-row actions, tag chips, note selection): covered by the `ui-feed` / `curate-*` features.
- **Note metadata pane** (createdAt/updatedAt display, frontmatter tag editing surface): covered by separate UI features.
- **Settings dialog and vault configuration modal**: covered by the `ui-app-shell` / `configure-vault` features.
- **Persistence layer correctness** (file I/O, atomic write, YAML serialisation): verified by `capture-auto-save` and `handle-save-failure` features.
- **TagInventory and Feed update projections** after save: covered by `curate-*` features.
- **Ctrl+N / Cmd+N platform disambiguation**: resolved — see behavioral-spec.md §9 RD-004. The listener uses `event.ctrlKey || event.metaKey`; source is always `'ctrl-N'`.
