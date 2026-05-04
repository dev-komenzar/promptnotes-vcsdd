---
sprintNumber: 2
feature: ui-editor
scope: "Effectful shell adapters and Svelte 5 EditorPane component that wires the pure reducer (Sprint 1) to DOM events and outbound IPC. Specifically: tauriEditorAdapter.ts (outbound IPC wrapping all eight dispatchXxx methods behind a TauriEditorAdapter interface), editorStateChannel.ts (inbound event.listen wrapper behind an EditorStateChannel interface), debounceTimer.ts (setTimeout/clearTimeout shell with injected clock), keyboardListener.ts (pane-scoped keydown handler for Ctrl+N/Cmd+N), clipboardAdapter.ts (navigator.clipboard or Tauri clipboard plugin wrapper behind a ClipboardAdapter interface), EditorPane.svelte (Svelte 5 component using $state/$effect/$derived runes, owns textarea, isDirty indicator, save indicator, save-failed banner with Retry/Discard/Cancel buttons, Copy button, +新規 button, all driven by the Sprint 1 editorReducer), and integration of EditorPane into +page.svelte (replacing the right-pane placeholder inside AppShell). DOM tests use vitest+jsdom with raw Svelte 5 mount/unmount/flushSync API and vi.fn() mock adapters; no @testing-library/svelte. Out of scope: any modification to the pure core modules (types.ts, editorPredicates.ts, editorReducer.ts, debounceSchedule.ts) or their Sprint 1 tests; Rust-side Tauri command handler implementations (no Rust receiver exists yet — all DOM tests mock invoke)."
negotiationRound: 0
status: under-review
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: "REQ-EDIT-001, REQ-EDIT-010 (PROP-EDIT-021) — EditorPane.body-input.dom.vitest.ts: each simulated input event on the textarea calls mockAdapter.dispatchEditNoteBody exactly once per event, carrying the full textarea value. After the dispatch, the isDirty indicator element appears in the DOM (data-testid='dirty-indicator' or equivalent). mockAdapter injected via props so no invoke() is ever called."
    weight: 0.07
    passThreshold: "EditorPane.body-input.dom.vitest.ts: all tests pass; vi.fn() spy on mockAdapter.dispatchEditNoteBody call count === 1 per simulated input event; querySelector('[data-testid=dirty-indicator]') is non-null after flushSync(); no real @tauri-apps/api call is made (vi.mock('@tauri-apps/api/core') returns zero actual invoke calls)."
  - id: CRIT-002
    dimension: spec_fidelity
    description: "REQ-EDIT-004, EC-EDIT-001 (PROP-EDIT-023) — EditorPane.idle-save.dom.vitest.ts: with vi.useFakeTimers(), advancing fake time by exactly IDLE_SAVE_DEBOUNCE_MS (2000ms) after the last simulated input fires mockAdapter.dispatchTriggerIdleSave exactly once with source: 'capture-idle'. Advancing by IDLE_SAVE_DEBOUNCE_MS - 1ms fires nothing. A burst of inputs separated by less than IDLE_SAVE_DEBOUNCE_MS produces exactly one fire after the burst. debounceTimer.ts receives an injected clock prop so the DOM test can control time deterministically."
    weight: 0.10
    passThreshold: "EditorPane.idle-save.dom.vitest.ts: all three scenarios pass (at-threshold, one-ms-before, rapid-burst); dispatchTriggerIdleSave spy call count assertions pass; vi.useFakeTimers() / vi.advanceTimersByTime() controls timing; debounceTimer.ts clock injection confirmed by the injected-clock test path."
  - id: CRIT-003
    dimension: spec_fidelity
    description: "REQ-EDIT-006, REQ-EDIT-007, REQ-EDIT-008, EC-EDIT-002 (PROP-EDIT-022) — EditorPane.blur-save.dom.vitest.ts: textarea blur while isDirty=true fires mockAdapter.dispatchTriggerBlurSave exactly once with source: 'capture-blur' and cancels any pending idle timer (spy on debounceTimer.cancel). Blur while status='saving' (driven by DomainSnapshotReceived inbound mock) fires nothing. Blur while isDirty=false fires nothing. Only one of TriggerBlurSave or TriggerIdleSave fires for a single dirty interval."
    weight: 0.10
    passThreshold: "EditorPane.blur-save.dom.vitest.ts: all four assertions pass (blur-while-dirty, blur-while-saving, blur-while-clean, no-duplicate-with-idle); dispatchTriggerBlurSave spy count === 1 for blur-while-dirty; dispatchTriggerBlurSave spy count === 0 for blur-while-saving and blur-while-clean; debounceTimer cancel spy called before dispatchTriggerBlurSave in the blur-while-dirty path."
  - id: CRIT-004
    dimension: spec_fidelity
    description: "REQ-EDIT-015, REQ-EDIT-016, REQ-EDIT-017, REQ-EDIT-018, REQ-EDIT-019 (PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-030) — EditorPane.save-failed.dom.vitest.ts: when EditorPane receives a DomainSnapshotReceived with status='save-failed', the banner with data-testid='save-failure-banner' is present; banner has role='alert'. For each of the four FsError kinds, the exact Japanese message string rendered in the DOM matches the bannerMessageFor output from Sprint 1. Retry button (data-testid='retry-save-button') click calls mockAdapter.dispatchRetrySave once. Discard button (data-testid='discard-session-button') click calls mockAdapter.dispatchDiscardCurrentSession once. Cancel button (data-testid='cancel-switch-button') click calls mockAdapter.dispatchCancelSwitch once. Banner is absent in status='editing'."
    weight: 0.11
    passThreshold: "EditorPane.save-failed.dom.vitest.ts: banner presence/absence assertions pass for all 5 status values; role='alert' attribute present; four FsError message string equality assertions each pass; Retry/Discard/Cancel spy counts each === 1 per click; banner absent in editing status confirmed by querySelector returning null."
  - id: CRIT-005
    dimension: spec_fidelity
    description: "REQ-EDIT-021, REQ-EDIT-022, EC-EDIT-006 (PROP-EDIT-016, PROP-EDIT-017) — EditorPane.copy.dom.vitest.ts: copy button click with non-empty-after-trim body calls clipboardAdapter.write(body) exactly once; copy button click when body is whitespace-only does not call clipboardAdapter.write; copy button is disabled (disabled HTML attribute + aria-disabled='true') in idle, switching, save-failed states and when body.trim().length === 0; copy button is enabled in editing/saving states when body is non-empty after trim. Transitions from whitespace-only to non-empty are reactive (test verifies per-render-cycle after flushSync)."
    weight: 0.08
    passThreshold: "EditorPane.copy.dom.vitest.ts: clipboardAdapter.write spy count assertions pass for all three branches (non-empty, whitespace-only, disabled states); disabled attribute present in idle/switching/save-failed and absent in editing-with-body and saving-with-body; aria-disabled='true' present when disabled; reactive transition test passes after two consecutive flushSync() calls."
  - id: CRIT-006
    dimension: spec_fidelity
    description: "REQ-EDIT-023, REQ-EDIT-024, EC-EDIT-007 (PROP-EDIT-018, PROP-EDIT-019) — EditorPane.new-note.dom.vitest.ts: +新規 button click calls mockAdapter.dispatchRequestNewNote with source: 'explicit-button'; keydown event on the pane root element with ctrlKey=true and key='n' calls mockAdapter.dispatchRequestNewNote with source: 'ctrl-N' and event.preventDefault() is called; keydown event with metaKey=true and key='n' also dispatches with source: 'ctrl-N'; keydown event dispatched on document (not the pane root) does NOT call dispatchRequestNewNote (listener is pane-scoped); +新規 button is disabled only in switching state."
    weight: 0.09
    passThreshold: "EditorPane.new-note.dom.vitest.ts: dispatchRequestNewNote spy count assertions pass for all four paths (explicit-button, ctrlKey, metaKey, out-of-pane no-dispatch); event.preventDefault spy confirmed called for ctrlKey/metaKey paths; button disabled attribute present in switching only; out-of-pane test constructs keydown event targeted at document.body and confirms zero calls."
  - id: CRIT-007
    dimension: spec_fidelity
    description: "REQ-EDIT-009 through REQ-EDIT-013 (PROP-EDIT-024 through PROP-EDIT-028) — EditorPane.state-mirror.dom.vitest.ts: for each of the five status values (idle, editing, saving, switching, save-failed), injecting a DomainSnapshotReceived via the mock editorStateChannel callback renders the correct DOM attributes: idle→textarea readonly/absent + copy disabled + placeholder; editing→textarea editable + dirty indicator when isDirty=true; saving→save indicator aria-label containing '保存中' + role='status' + textarea not disabled; switching→textarea disabled + copy disabled + new-note disabled; save-failed→banner present + textarea editable + copy disabled + new-note enabled."
    weight: 0.08
    passThreshold: "EditorPane.state-mirror.dom.vitest.ts: all five status sub-tests pass; each asserts the exact set of DOM attributes listed in the description; flushSync() called after each mock state injection before assertion; mockEditorStateChannel.emit() API used to simulate inbound snapshots."
  - id: CRIT-008
    dimension: spec_fidelity
    description: "AppShell integration (EditorPane.mount.dom.vitest.ts) — mounting +page.svelte (or AppShell with EditorPane in body slot) with a mocked invoke_app_startup returning Configured causes the textarea and +新規 button to be present in the DOM. Confirms EditorPane replaces the right-pane placeholder in AppShell. vi.mock('@tauri-apps/api/core') is in effect; no real Tauri calls. The 126 Sprint 1 pure-core tests and the 220 existing app-shell tests remain green after the AppShell wiring change."
    weight: 0.06
    passThreshold: "EditorPane.mount.dom.vitest.ts: querySelector('textarea') non-null and querySelector('[data-testid=new-note-button]') non-null after mount+flushSync; bun test src/lib/editor inside promptnotes/ exits 0 with all 126 Sprint 1 pure-core tests still passing; bun run test:dom -- src/lib/editor/__tests__/dom inside promptnotes/ exits 0 with all 220 app-shell tests and all Sprint 2 DOM tests still passing; +page.svelte imports EditorPane and no longer contains the placeholder div."
  - id: CRIT-009
    dimension: implementation_correctness
    description: "tauriEditorAdapter.ts unit tests (tauriEditorAdapter.dom.vitest.ts, vitest): each of the eight dispatchXxx methods (dispatchEditNoteBody, dispatchTriggerIdleSave, dispatchTriggerBlurSave, dispatchRetrySave, dispatchDiscardCurrentSession, dispatchCancelSwitch, dispatchCopyNoteBody, dispatchRequestNewNote) calls vi.mocked(invoke) with the exact snake_case command name and the exact payload shape defined in verification-architecture.md §8 and §10. TauriEditorAdapter interface is exported so DOM tests can inject a vi.fn() mock without touching invoke."
    weight: 0.06
    passThreshold: "__tests__/dom/tauriEditorAdapter.dom.vitest.ts: all eight method tests pass; each asserts invoke called with the correct first argument (command name string) and second argument (payload object); TauriEditorAdapter interface has all eight dispatchXxx methods with the exact signatures from behavioral-spec.md §10; tsc --strict exits 0."
  - id: CRIT-010
    dimension: implementation_correctness
    description: "editorStateChannel.ts unit tests (editorStateChannel.dom.vitest.ts, vitest): subscribe() calls event.listen('editing_session_state_changed', handler) and returns an unlisten cleanup function; the returned cleanup calls the unlisten function when invoked; the handler extracts payload.payload.state and passes it to the subscriber callback. EditorStateChannel interface exported. vi.mock('@tauri-apps/api/event') used so no real Tauri runtime is required."
    weight: 0.05
    passThreshold: "__tests__/dom/editorStateChannel.dom.vitest.ts: subscribe wires listen assertion passes; unlisten called on cleanup assertion passes; payload extraction assertion passes; EditorStateChannel interface is a named export from editorStateChannel.ts confirming the type-level boundary."
  - id: CRIT-011
    dimension: implementation_correctness
    description: "debounceTimer.ts unit tests (debounceTimer.dom.vitest.ts, vitest): scheduleIdleSave(at, callback) calls the injected clock.now() to compute delay, then calls setTimeout(callback, delay); cancel() calls clearTimeout on the active handle; a second scheduleIdleSave before the first fires cancels the first timer. The injected clock: { now(): number } replaces Date.now() so tests use deterministic timestamps. Integration with computeNextFireAt from Sprint 1 confirmed: the timer reads computeNextFireAt output and delegates to the injected setTimeout."
    weight: 0.05
    passThreshold: "__tests__/dom/debounceTimer.dom.vitest.ts: scheduleIdleSave calls setTimeout with the delay derived from fireAt - clock.now() assertion passes; cancel calls clearTimeout assertion passes; re-schedule replaces the previous timer assertion passes; no real Date.now() call in debounceTimer.ts (canonical purity-audit grep does not apply here since debounceTimer is explicitly impure, but the injected clock pattern is confirmed by the test)."
  - id: CRIT-012
    dimension: implementation_correctness
    description: "keyboardListener.ts and clipboardAdapter.ts unit tests (keyboardListener.dom.vitest.ts, clipboardAdapter.dom.vitest.ts, vitest): keyboardListener registers on the passed-in pane root element (not document); fires the callback only for (ctrlKey||metaKey)&&key==='n'; calls event.preventDefault(); does not fire for other key combos. clipboardAdapter.write(body) calls navigator.clipboard.writeText(body) (or Tauri clipboard plugin if installed); ClipboardAdapter interface exported."
    weight: 0.05
    passThreshold: "__tests__/dom/keyboardListener.dom.vitest.ts: three assertions pass (ctrlKey fires, metaKey fires, other-key does not fire); event.preventDefault spy confirmed called; listener attached to panelRoot not document confirmed by constructing two separate dispatchEvent calls. __tests__/dom/clipboardAdapter.dom.vitest.ts: write spy assertion on navigator.clipboard.writeText passes with the exact body string; ClipboardAdapter interface is a named export."
  - id: CRIT-013
    dimension: structural_integrity
    description: "NFR-EDIT-005, NFR-EDIT-006, NFR-EDIT-007 (PROP-EDIT-035) — DESIGN.md style conformance: EditorPane.svelte source file contains the exact 5-layer Deep Shadow string for the banner container; banner has left accent color #dd5b00; banner border-radius is 8px; all button text uses font-size: 15px and font-weight: 600; textarea uses border: 1px solid #dddddd; placeholder color is #a39e98; no hex or rgba value outside the DESIGN.md §10 Token Reference appears in any ui-editor Svelte component. Verified by grep of component source files."
    weight: 0.05
    passThreshold: "grep -r '5-layer\\|rgba(0,0,0,0.05) 0px 23px 52px' src/lib/editor/EditorPane.svelte returns a hit; grep -r '#dd5b00' src/lib/editor/ returns a hit in the banner section; grep 'font-size: 15px' and 'font-weight: 600' return hits on button styles; tsc --strict exits 0; design-tokens.audit.test.ts (from ui-app-shell sprint) still passes with no new token violations in editor files."
  - id: CRIT-014
    dimension: structural_integrity
    description: "Phase 5 purity audit gate: Sprint 1 pure-core files remain clean. The canonical purity-audit grep pattern from verification-architecture.md §2 applied to editorPredicates.ts, editorReducer.ts, and debounceSchedule.ts returns zero hits after Sprint 2 is authored. No Sprint 2 file inadvertently imports into or modifies the pure core. grep -r 'from .svelte/store.' src/lib/editor/ returns zero hits (PROP-EDIT-036). grep -r 'EditingSessionState' src/lib/editor/*.svelte shows no assignment patterns."
    weight: 0.05
    passThreshold: "Phase 5 canonical purity grep returns zero hits on all three pure modules; grep from 'svelte/store' returns zero hits; tsc --noEmit --strict --noUncheckedIndexedAccess exits 0; bun run check (svelte-check) exits 0."
---

# Sprint 2: ui-editor effectful shell + component

This contract captures 14 acceptance criteria (CRIT-001..CRIT-014) derived from the integration-tier proof obligations (PROP-EDIT-012 through PROP-EDIT-039) and structural requirements (NFR-EDIT-001..008, PROP-EDIT-035, PROP-EDIT-036) defined in `specs/verification-architecture.md` and `specs/behavioral-spec.md`. Sprint 1 (pure core, 126 tests, CRIT-001..012 all green) is frozen. Sprint 2 delivers the effectful shell and mounts the editor inside AppShell.

---

## 1. Sprint Goal

Produce a working `EditorPane` Svelte 5 component mounted inside `AppShell`, reachable when state is `Configured`. The component wires the Sprint 1 pure reducer to DOM events (textarea input, blur, keyboard shortcut) and outbound IPC adapters. Domain IPC is mocked at the test boundary via injected `TauriEditorAdapter` and `ClipboardAdapter` interfaces — no Tauri command implementations on the Rust side are required yet (that is a separate backend feature). The shippable artifact is: all Sprint 2 DOM tests and adapter unit tests passing (verified by two commands: `bun test src/lib/editor` for Sprint 1 regression and `bun run test:dom -- src/lib/editor/__tests__/dom` for DOM + adapter suites), all 126 Sprint 1 tests still passing, all 220 app-shell regression tests still passing, `bun run check` exits 0.

---

## 2. In-Scope Modules

All files live under `promptnotes/src/lib/editor/` unless noted.

### `tauriEditorAdapter.ts` — OUTBOUND only

Implements the `TauriEditorAdapter` interface. Every method wraps `invoke('<command_name>', payload)` from `@tauri-apps/api/core`. The eight methods and their candidate command names (informational; see behavioral-spec.md §8 and verification-architecture.md §8):

| Method | Candidate Tauri command name | Payload |
|---|---|---|
| `dispatchEditNoteBody(noteId, body, issuedAt)` | `edit_note_body` | `{ noteId, body, issuedAt, dirty: true }` |
| `dispatchTriggerIdleSave(source)` | `trigger_idle_save` | `{ source: 'capture-idle' }` |
| `dispatchTriggerBlurSave(source)` | `trigger_blur_save` | `{ source: 'capture-blur' }` |
| `dispatchRetrySave()` | `retry_save` | `{}` |
| `dispatchDiscardCurrentSession()` | `discard_current_session` | `{}` |
| `dispatchCancelSwitch()` | `cancel_switch` | `{}` |
| `dispatchCopyNoteBody(noteId)` | `copy_note_body` | `{ noteId }` |
| `dispatchRequestNewNote(source, issuedAt)` | `request_new_note` | `{ source, issuedAt }` |

`TauriEditorAdapter` interface is a named export:

```typescript
export interface TauriEditorAdapter {
  dispatchEditNoteBody(noteId: string, body: string, issuedAt: string): Promise<void>;
  dispatchTriggerIdleSave(source: 'capture-idle'): Promise<void>;
  dispatchTriggerBlurSave(source: 'capture-blur'): Promise<void>;
  dispatchRetrySave(): Promise<void>;
  dispatchDiscardCurrentSession(): Promise<void>;
  dispatchCancelSwitch(): Promise<void>;
  dispatchCopyNoteBody(noteId: string): Promise<void>;
  dispatchRequestNewNote(source: 'explicit-button' | 'ctrl-N', issuedAt: string): Promise<void>;
}
```

DOM tests inject a `vi.fn()` implementation of this interface as a prop; no real `invoke()` is ever called in tests.

Tier 0 structural-conformance assertions (`_AssertEditNoteBodyShape`, `_AssertCopyNoteBodyShape`) from verification-architecture.md §10 must appear in this file.

### `editorStateChannel.ts` — INBOUND only

Wraps `@tauri-apps/api/event listen('editing_session_state_changed', handler)`. Extracts `payload.payload.state` and passes it to the subscriber callback.

```typescript
export interface EditorStateChannel {
  subscribe(handler: (state: EditingSessionState) => void): () => void;
}
```

Returns an unlisten cleanup function from `subscribe`. `EditorStateChannel` interface is a named export. Does NOT call `invoke(...)`.

### `debounceTimer.ts`

Wraps `setTimeout`/`clearTimeout`. Receives an injected `clock: { now(): number }` so tests can use a deterministic clock without `vi.useFakeTimers()` at the module level (though DOM tests may use `vi.useFakeTimers()` at the test level for end-to-end timer simulation).

```typescript
export interface DebounceTimer {
  scheduleIdleSave(at: number, callback: () => void): void;
  cancel(): void;
}

export function createDebounceTimer(clock: { now(): number }): DebounceTimer;
```

`scheduleIdleSave(at, callback)` computes `delay = at - clock.now()` and calls `setTimeout(callback, delay)`. `cancel()` calls `clearTimeout` on the active handle. Re-scheduling cancels any pending timer before setting the new one. Reads `computeNextFireAt` from Sprint 1 to determine `at`.

### `keyboardListener.ts`

Attaches a `keydown` listener to a passed-in editor pane root element (NOT `document`). Detects `(ctrlKey || metaKey) && key.toLowerCase() === 'n'`, calls `event.preventDefault()`, invokes the provided `onNewNote` callback.

```typescript
export function attachKeyboardListener(
  panelRoot: HTMLElement,
  onNewNote: (source: 'ctrl-N') => void
): () => void; // returns cleanup function
```

The returned function calls `panelRoot.removeEventListener(...)`. The `$effect` in `EditorPane.svelte` calls this and returns the cleanup.

### `clipboardAdapter.ts`

Wraps `navigator.clipboard.writeText(text)`. If `@tauri-apps/plugin-clipboard-manager` is installed in `promptnotes/package.json` devDependencies, use the Tauri plugin; otherwise use `navigator.clipboard`. Check `promptnotes/package.json` before authoring this file.

```typescript
export interface ClipboardAdapter {
  write(text: string): Promise<void>;
}

export function createClipboardAdapter(): ClipboardAdapter;
```

`ClipboardAdapter` interface is a named export for injection in DOM tests.

### `EditorPane.svelte` — Svelte 5 component

Svelte 5 component using `$state`, `$derived`, `$effect` runes. Owns:
- Body `<textarea>` with `oninput` and `onblur` handlers
- `isDirty` indicator (data-testid `dirty-indicator`)
- Save-in-progress indicator (role=`status`, aria-label containing `保存中`)
- Save-failure banner (data-testid `save-failure-banner`, role=`alert`) with Retry / Discard / Cancel buttons (data-testid: `retry-save-button`, `discard-session-button`, `cancel-switch-button`)
- Copy button (data-testid `copy-body-button`)
- +新規 button (data-testid `new-note-button`)

Props (all injected, allowing DOM tests to pass fakes):

```typescript
interface Props {
  adapter: TauriEditorAdapter;
  stateChannel: EditorStateChannel;
  timer: DebounceTimer;
  clipboard: ClipboardAdapter;
}
```

Internal state:
- `let viewState = $state<EditorViewState>(initialViewState)` — driven by `DomainSnapshotReceived` via `editorReducer`
- `let body = $state<string>('')` — current textarea value
- Keyboard listener attached in `$effect` to the component's root element via `attachKeyboardListener`

The component processes all `EditorCommand` outputs from `editorReducer` via an exhaustive switch inside `$effect` (the Tier 0 impure-shell exhaustive-switch obligation from verification-architecture.md §10).

MUST NOT import `@tauri-apps/api` or any pure-core module's forbidden APIs. Uses the Sprint 1 `editorReducer`, `editorPredicates`, and `debounceSchedule` via TypeScript imports only.

### `promptnotes/src/routes/+page.svelte`

Replace the right-pane placeholder `<div>` inside `<AppShell>`'s body slot with `<EditorPane>` instantiation. Default props use the real `createTauriEditorAdapter()`, `createEditorStateChannel()`, `createDebounceTimer(clockAdapter)`, and `createClipboardAdapter()` factory functions. The existing `appShellStore` state still controls when the editor is mounted (only in `Configured` state).

---

## 3. Out-of-Scope

The following MUST NOT be modified during Sprint 2:

- **Sprint 1 pure-core files** (frozen): `types.ts`, `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`
- **Sprint 1 test files** (frozen): `editorPredicates.test.ts`, `editorPredicates.property.test.ts`, `editorReducer.test.ts`, `editorReducer.property.test.ts`, `debounceSchedule.test.ts`, `debounceSchedule.property.test.ts`
- **Rust-side Tauri command handlers**: no `lib.rs` or Rust source changes. The IPC commands have no Rust receiver yet — DOM tests mock `invoke`.
- **behavioral-spec.md and verification-architecture.md**: no spec changes in Sprint 2.
- **AppShell source files** (except `+page.svelte` wiring): AppShell's own store, boot orchestrator, and modal logic are untouched.

---

## 4. Test Plan

### DOM tests (vitest + jsdom + Svelte 5 mount API)

Location: `promptnotes/src/lib/editor/__tests__/dom/`

All DOM tests follow the pattern from `promptnotes/src/lib/ui/app-shell/__tests__/dom/AppShell.dom.vitest.ts`:
- `import { mount, unmount, flushSync } from 'svelte'`
- Mock adapter via `vi.fn()` props injection — NOT via module-level mock
- `vi.mock('@tauri-apps/api/core')` at the file level to prevent accidental real invoke

| File | PROP-EDIT coverage | Key assertions |
|---|---|---|
| `EditorPane.body-input.dom.vitest.ts` | PROP-EDIT-021 (REQ-EDIT-001, REQ-EDIT-010) | dispatchEditNoteBody spy count per input event; dirty indicator DOM presence |
| `EditorPane.idle-save.dom.vitest.ts` | PROP-EDIT-023 (REQ-EDIT-004, EC-EDIT-001) | vi.useFakeTimers(); at-threshold fires; one-ms-before does not; burst fires once |
| `EditorPane.blur-save.dom.vitest.ts` | PROP-EDIT-022 (REQ-EDIT-006, REQ-EDIT-007, REQ-EDIT-008, EC-EDIT-002) | blur-while-dirty; blur-while-saving; blur-while-clean; no-duplicate |
| `EditorPane.save-failed.dom.vitest.ts` | PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-030 (REQ-EDIT-015, REQ-EDIT-017, REQ-EDIT-018, REQ-EDIT-019) | banner present/absent per status; 4 FsError Japanese messages; 3 button dispatches |
| `EditorPane.copy.dom.vitest.ts` | PROP-EDIT-016, PROP-EDIT-017 (REQ-EDIT-021, REQ-EDIT-022, EC-EDIT-006) | copy enabled matrix; clipboardAdapter.write spy; aria-disabled; reactive transition |
| `EditorPane.new-note.dom.vitest.ts` | PROP-EDIT-018, PROP-EDIT-019 (REQ-EDIT-023, REQ-EDIT-024, EC-EDIT-007) | explicit-button; ctrlKey; metaKey; out-of-pane no-dispatch; switching disabled |
| `EditorPane.state-mirror.dom.vitest.ts` | PROP-EDIT-024 through PROP-EDIT-028 (REQ-EDIT-009 through REQ-EDIT-013) | 5-status DOM attribute matrix per inbound mock snapshot |
| `EditorPane.mount.dom.vitest.ts` | REQ-EDIT-014 / AppShell integration | mount +page.svelte; textarea and new-note button present; 126+220 regression |

Additional DOM tests mapping to verification-architecture.md §5 integration-tier obligations:

| File | PROP-EDIT coverage |
|---|---|
| `editor-session-state.dom.vitest.ts` | PROP-EDIT-037 (EC-EDIT-003), PROP-EDIT-039 (EC-EDIT-005) |
| `save-failure-banner.dom.vitest.ts` | PROP-EDIT-015 (REQ-EDIT-020 style grep), PROP-EDIT-038 (EC-EDIT-004) |
| `editor-validation.dom.vitest.ts` | PROP-EDIT-032 (REQ-EDIT-027) |
| `editor-accessibility.dom.vitest.ts` | PROP-EDIT-033 (NFR-EDIT-001, NFR-EDIT-002) |
| `editor-panel.dom.vitest.ts` | PROP-EDIT-020a, PROP-EDIT-020b (REQ-EDIT-025), PROP-EDIT-034 (NFR-EDIT-003, NFR-EDIT-004) |

### Adapter unit tests (vitest)

Location: `promptnotes/src/lib/editor/__tests__/dom/`

These files live alongside the DOM tests so vitest discovers them via the `src/lib/**/__tests__/dom/**/*.vitest.ts` include pattern. They use `vi.mock('@tauri-apps/api/core')` and `vi.mock('@tauri-apps/api/event')`, which require the `vi` namespace available only under vitest.

| File | Coverage |
|---|---|
| `tauriEditorAdapter.dom.vitest.ts` | Each dispatchXxx calls invoke with correct command name + payload (CRIT-009) |
| `editorStateChannel.dom.vitest.ts` | subscribe wires listen; cleanup calls unlisten; payload extraction (CRIT-010) |
| `debounceTimer.dom.vitest.ts` | scheduleIdleSave / cancel / re-schedule via injected clock (CRIT-011) |
| `keyboardListener.dom.vitest.ts` | pane-scoped keydown detection; ctrlKey / metaKey / other-key; preventDefault (CRIT-012) |
| `clipboardAdapter.dom.vitest.ts` | write(body) calls navigator.clipboard.writeText(body) (CRIT-012) |

Run commands:
- Sprint 1 + adapter regression (bun:test discovers `*.test.ts`): `bun test src/lib/editor` inside `promptnotes/` — must exit 0 with X >= 126 pass, 0 fail
- DOM tests + adapter integration (vitest discovers `*.dom.vitest.ts`): `bun run test:dom -- src/lib/editor/__tests__/dom` inside `promptnotes/` — must exit 0 with all suites green
- There is no single command that runs both tiers; both commands must be run and pass independently.

---

## 5. Pass Criteria

| ID | REQ/PROP coverage | Weight | Pass threshold |
|---|---|---|---|
| CRIT-001 | REQ-EDIT-001, REQ-EDIT-010 / PROP-EDIT-021 | 0.07 | EditorPane.body-input.dom.vitest.ts: dispatchEditNoteBody spy count === 1 per input; data-testid=dirty-indicator non-null after flushSync; all tests pass |
| CRIT-002 | REQ-EDIT-004, EC-EDIT-001 / PROP-EDIT-023 | 0.10 | EditorPane.idle-save.dom.vitest.ts: three timer scenarios (at-threshold, one-ms-before, rapid-burst) all pass; dispatchTriggerIdleSave spy count assertions confirmed |
| CRIT-003 | REQ-EDIT-006, REQ-EDIT-007, REQ-EDIT-008, EC-EDIT-002 / PROP-EDIT-022 | 0.10 | EditorPane.blur-save.dom.vitest.ts: four assertions (blur-while-dirty, blur-while-saving, blur-while-clean, no-duplicate) all pass; blur-while-saving spy count === 0 confirmed |
| CRIT-004 | REQ-EDIT-015, REQ-EDIT-016, REQ-EDIT-017, REQ-EDIT-018, REQ-EDIT-019 / PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-030 | 0.11 | EditorPane.save-failed.dom.vitest.ts: banner present/absent assertions for all 5 status values pass; 4 Japanese string equality assertions pass; 3 button dispatch spy counts each === 1; role='alert' confirmed |
| CRIT-005 | REQ-EDIT-021, REQ-EDIT-022, EC-EDIT-006 / PROP-EDIT-016, PROP-EDIT-017 | 0.08 | EditorPane.copy.dom.vitest.ts: clipboardAdapter.write spy assertions for all branches pass; disabled/aria-disabled matrix assertions pass; reactive transition test passes |
| CRIT-006 | REQ-EDIT-023, REQ-EDIT-024, EC-EDIT-007 / PROP-EDIT-018, PROP-EDIT-019 | 0.09 | EditorPane.new-note.dom.vitest.ts: four dispatch path assertions pass; event.preventDefault spy confirmed for ctrlKey/metaKey; out-of-pane no-dispatch confirmed; switching-disabled confirmed |
| CRIT-007 | REQ-EDIT-009 through REQ-EDIT-013 / PROP-EDIT-024 through PROP-EDIT-028 | 0.08 | EditorPane.state-mirror.dom.vitest.ts: all five status DOM attribute sub-tests pass after flushSync; each named attribute (disabled, aria-disabled, role, aria-label) confirmed per status |
| CRIT-008 | REQ-EDIT-014 / AppShell wiring | 0.06 | EditorPane.mount.dom.vitest.ts: textarea and data-testid=new-note-button non-null after mount; bun test src/lib/editor exits 0 with 126 Sprint 1 tests green; bun run test:dom -- src/lib/editor/__tests__/dom exits 0 with 220 app-shell tests green |
| CRIT-009 | REQ-EDIT-001, REQ-EDIT-004, REQ-EDIT-006, REQ-EDIT-017, REQ-EDIT-018, REQ-EDIT-019, REQ-EDIT-021, REQ-EDIT-023 / RD-016, RD-018 | 0.06 | __tests__/dom/tauriEditorAdapter.dom.vitest.ts: all eight dispatchXxx method tests pass with correct command name and payload assertions; TauriEditorAdapter interface is a named export confirmed by tsc; Tier 0 _AssertEditNoteBodyShape and _AssertCopyNoteBodyShape compile-time assertions present |
| CRIT-010 | REQ-EDIT-014 / RD-011, RD-016 | 0.05 | __tests__/dom/editorStateChannel.dom.vitest.ts: subscribe/unlisten/payload-extraction assertions all pass; EditorStateChannel interface is a named export; vi.mock('@tauri-apps/api/event') used |
| CRIT-011 | REQ-EDIT-004, REQ-EDIT-005 / RD-012 | 0.05 | __tests__/dom/debounceTimer.dom.vitest.ts: scheduleIdleSave delay computation assertion passes; cancel clearTimeout assertion passes; re-schedule cancels previous assertion passes; injected clock confirmed by test |
| CRIT-012 | REQ-EDIT-024, REQ-EDIT-021 / RD-004, RD-008 | 0.05 | __tests__/dom/keyboardListener.dom.vitest.ts: ctrlKey/metaKey fire, other-key does not fire, out-of-pane does not fire, preventDefault confirmed — all pass. __tests__/dom/clipboardAdapter.dom.vitest.ts: write(body) routes to navigator.clipboard.writeText(body) — passes |
| CRIT-013 | NFR-EDIT-005, NFR-EDIT-006, NFR-EDIT-007 / PROP-EDIT-035 | 0.05 | grep confirms 5-layer Deep Shadow string, #dd5b00 accent, 8px radius, 15px/600 button font in EditorPane.svelte source; design-tokens.audit.test.ts still passes with no new violations; tsc exits 0 |
| CRIT-014 | NFR-EDIT-008, REQ-EDIT-014 / PROP-EDIT-036, PROP-EDIT-029 | 0.05 | Phase 5 canonical purity grep returns zero hits on editorPredicates.ts, editorReducer.ts, debounceSchedule.ts; grep from 'svelte/store' returns zero hits; grep EditingSessionState src/lib/editor/*.svelte shows no assignment patterns; bun run check exits 0 |

**Weight total: 0.07 + 0.10 + 0.10 + 0.11 + 0.08 + 0.09 + 0.08 + 0.06 + 0.06 + 0.05 + 0.05 + 0.05 + 0.05 + 0.05 = 1.00**

---

## 6. Forbidden in This Sprint

- DO NOT modify `types.ts`, `editorPredicates.ts`, `editorReducer.ts`, or `debounceSchedule.ts` (Sprint 1 pure-core, frozen).
- DO NOT modify any Sprint 1 test file.
- DO NOT add new constants — all values (`IDLE_SAVE_DEBOUNCE_MS`, color tokens, shadow string) come from Sprint 1 or DESIGN.md.
- DO NOT implement Rust-side Tauri command handlers (no changes to `src-tauri/`).
- DO NOT use `{@html`, `innerHTML`, `outerHTML`, or `insertAdjacentHTML` anywhere in `ui-editor` components — Phase 5 security grep will catch violations.
- DO NOT import `@tauri-apps/api` in any pure-core module; it is already forbidden by the canonical purity-audit pattern.
- DO NOT introduce `writable` from `svelte/store` for editor-internal state — all local state uses `$state(...)`.
- DO NOT use `@testing-library/svelte` — raw Svelte 5 `mount`/`unmount`/`flushSync` API only.

---

## 7. Definition of Done

1. All Sprint 2 DOM tests (8 primary files) and adapter unit tests (5 files, all under `__tests__/dom/`) pass under two separate commands: (a) `bun test src/lib/editor` inside `promptnotes/` exits 0 with X >= 126 pass and 0 fail (Sprint 1 pure-core regression); (b) `bun run test:dom -- src/lib/editor/__tests__/dom` inside `promptnotes/` exits 0 with all Sprint 2 DOM and adapter suites green. Both commands must pass; neither alone is sufficient.

2. All 126 Sprint 1 pure-core tests still pass (regression baseline confirmed in the green-phase evidence log).

3. All 220 existing app-shell tests still pass.

4. `bun run dev` (Vite) starts without compile errors — no TypeScript errors in the Svelte component.

5. `bun run check` (svelte-check) passes with 0 errors and 0 warnings in `src/lib/editor/`.

6. `tsc --noEmit --strict --noUncheckedIndexedAccess` inside `promptnotes/` exits 0.

7. Mounting `+page.svelte` in the DOM test with `invoke_app_startup` mocked to return `Configured` shows the textarea and buttons rendered in jsdom. Confirmed by `EditorPane.mount.dom.vitest.ts`.

8. DESIGN.md style audit: grep confirms the 5-layer Deep Shadow string, `#dd5b00` orange accent, `#a39e98` placeholder, and `font-size: 15px; font-weight: 600` button typography are all present in `EditorPane.svelte` source.

9. Phase 5 canonical purity-audit grep (pattern from verification-architecture.md §2) returns zero hits on `editorPredicates.ts`, `editorReducer.ts`, and `debounceSchedule.ts`.

10. `grep -r "from 'svelte/store'" src/lib/editor/` returns zero hits (PROP-EDIT-036).

11. Sprint contract adversary review (fresh context) returns PASS before the Red phase (Phase 2a) begins.

---

## 8. Sprint Adversary Review Targets

The contract reviewer must confirm all of the following before the Red phase (Phase 2a) begins:

1. **Pure-core freeze**: Every CRIT in §5 that touches a pure-core module does so only via import (read-only use) — no CRIT permits modification of `types.ts`, `editorPredicates.ts`, `editorReducer.ts`, or `debounceSchedule.ts`. Sprint 1 is explicitly frozen in §6.

2. **Interface injection completeness**: Every effectful shell module (`tauriEditorAdapter.ts`, `editorStateChannel.ts`, `clipboardAdapter.ts`) exposes a named TypeScript interface that DOM tests can satisfy with a `vi.fn()` mock. `debounceTimer.ts` exposes `DebounceTimer` and accepts an injected `clock`. `EditorPane.svelte` receives all adapters as props. The reviewer confirms no module uses a module-level singleton that bypasses injection.

3. **PROP-EDIT traceability**: Every integration-tier PROP-EDIT-XXX with `Required: false` in verification-architecture.md §4 that is listed in the DOM test plan (§4) is cited in at least one CRIT-NNN pass threshold. The reviewer confirms that PROP-EDIT-012 through PROP-EDIT-028, PROP-EDIT-030 through PROP-EDIT-034, PROP-EDIT-037 through PROP-EDIT-039 are collectively covered by CRIT-001..CRIT-008.

4. **Weight arithmetic**: CRIT-001 through CRIT-014 weights sum to exactly 1.00 (verified: 0.07+0.10+0.10+0.11+0.08+0.09+0.08+0.06+0.06+0.05+0.05+0.05+0.05+0.05 = 1.00).

5. **Pass threshold specificity**: Every pass threshold names the exact test file path and the exact spy/assertion being checked. No threshold uses vague language such as "tests pass" without naming the file.

6. **Keyboard listener scope**: CRIT-006 confirms the listener attaches to the pane root element (NOT `document`), per RD-008. The reviewer confirms the out-of-pane no-dispatch assertion is listed and names the concrete test mechanism (keydown event dispatched on `document.body`, not `panelRoot`).

7. **AppShell regression safety**: CRIT-008 explicitly asserts that 220 existing app-shell tests remain green. The reviewer confirms that the only AppShell file modified in Sprint 2 is `+page.svelte` (replacing a placeholder with `<EditorPane>`) and that no AppShell store, boot orchestrator, or vault modal file is touched.

8. **Svelte 5 mount API conformance**: Every DOM test file listed in §4 uses `import { mount, unmount, flushSync } from 'svelte'` and does NOT use `@testing-library/svelte`. The reviewer confirms §6 explicitly forbids `@testing-library/svelte`.

9. **No re-litigation of Sprint 1 scope**: No CRIT entry re-tests `editorReducer`, `editorPredicates`, or `debounceSchedule` internals (those are covered by Sprint 1 CRIT-001..012). Sprint 2 CRITs test only wiring, DOM rendering, and adapter call shapes.

10. **Security audit**: §6 explicitly lists the forbidden `{@html` / `innerHTML` / `outerHTML` / `insertAdjacentHTML` directives. The reviewer confirms this matches the Phase 5 security audit grep in verification-architecture.md §7.
