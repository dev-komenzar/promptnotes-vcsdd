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

This document defines the verification strategy for the `ui-editor` feature as specified in `specs/behavioral-spec.md`. The `ui-editor` feature is an orchestration-only UI layer that translates user events (textarea input, blur, button clicks, keyboard shortcuts) into the domain commands `EditNoteBody`, `TriggerIdleSave`, `TriggerBlurSave`, `CopyNoteBody`, `RequestNewNote`, `RetrySave`, `DiscardCurrentSession`, and `CancelSwitch`, and reflects the resulting `EditingSessionState` transitions back into the Svelte component tree.

Because the feature is primarily reactive orchestration, the verification strategy separates the deterministic pure core (state predicates, debounce scheduling logic, save-error message derivation, and a state reducer) from the effectful shell (Svelte component, timer scheduling via `setTimeout`, Tauri IPC adapters, clipboard adapter, and DOM keyboard/focus listeners). All Tier 2 property tests target pure modules exclusively; DOM and IPC behaviours are covered by integration tests using vitest + jsdom + raw Svelte 5 mount API (following the pattern in `promptnotes/src/lib/ui/app-shell/__tests__/dom/AppShell.dom.vitest.ts`).

**State model note**: `EditingSessionState` is owned by the Rust domain. The TypeScript `editorReducer` is a **mirror reducer** producing `EditorViewState` — a UI-side projection. See `behavioral-spec.md §3.4a` and `§10`.

---

## 2. Purity Boundary Map

The boundary between the pure core and the effectful shell is defined as follows: a module is **pure** if and only if its exported functions are deterministic, perform no I/O of any kind, and contain none of the following API calls.

**Canonical forbidden-API grep pattern** (applied to pure modules in Phase 5 purity audit):

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

This regex is the **single canonical purity-audit pattern**. It supersedes the shorter list previously appearing in §7. Pure modules must also pass `tsc --strict --noUncheckedIndexedAccess`.

### Pure core modules

| Module | Layer | Exports | Forbidden APIs (none may appear) |
|---|---|---|---|
| `editorPredicates.ts` | pure | `canCopy(bodyStr: string, status: EditorViewState['status']): boolean` — `false` for `status ∈ {'idle','switching','save-failed'}` regardless of body; `!emptyAfterTrim(bodyStr)` for `status ∈ {'editing','saving'}`. `isEmptyAfterTrim(bodyStr: string): boolean` — `bodyStr.trim().length === 0` (ECMAScript `String.prototype.trim`). `bannerMessageFor(error: SaveError): string \| null` — exhaustive switch over `SaveError` variants. `classifySource(triggerKind: 'idle' \| 'blur'): 'capture-idle' \| 'capture-blur'` — pure mapping from trigger event kind to the domain enum value; `'idle' → 'capture-idle'`; `'blur' → 'capture-blur'`. MUST NOT import `@tauri-apps/api`. (ref: domain-events.md:115 — only `'capture-idle'` and `'capture-blur'` are in scope for this feature; behavioral-spec.md §9 RD-001) | All APIs in the canonical purity-audit pattern above |
| `editorReducer.ts` | pure | `editorReducer(state: EditorViewState, action: EditorAction): { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }`. Total function: every (status, action) pair returns a defined `EditorViewState` and a (possibly empty) `commands` array. `EditorViewState` is a UI-side mirror of `EditingSessionState` (see `behavioral-spec.md §3.4a`); it contains `status`, `isDirty`, `currentNoteId`, `pendingNextNoteId`. `isDirty` transitions are: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained; `DomainSnapshotReceived { snapshot } → mirror snapshot fields directly` (aggregates.md:273–276). The `commands` output carries save commands whose `source` field equals the `source` present in the triggering action payload — the reducer never infers, transforms, or defaults `source`. PROP-EDIT-007/008/009 reference this signature. MUST NOT import `@tauri-apps/api`. | All APIs in the canonical purity-audit pattern above |
| `debounceSchedule.ts` | pure | `computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number }): { shouldFire: boolean, fireAt: number \| null }`. Given timestamps and a quiescence window, returns whether/when an idle save should fire. `nowMs` is supplied by the caller (never calls `Date.now()` internally). `shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean` — accepts a sequence of edit timestamps for property-test enumeration; production usage supplies a 1-element array. `nextFireAt(lastEditTimestamp: number, debounceMs: number): number`. The actual `setTimeout` call lives in the impure shell. MUST NOT import `@tauri-apps/api`. Shell pattern: on each `EditNoteBody` action, the shell calls `cancelIdleSave(handle)` (if any) and then `scheduleIdleSave(fireAt - clock.now(), callback)` based on `computeNextFireAt` output. The shell stores only `lastEditTimestamp` (a single `$state` number). (ref: behavioral-spec.md §12 Debounce Contract) | All APIs in the canonical purity-audit pattern above |

### Effectful shell modules

| Module | Layer | Reason |
|---|---|---|
| `EditorPanel.svelte` | impure | Svelte 5 component: uses `$state`, `$derived`, `$effect`, `bind:value`, DOM event handlers (`oninput`, `onblur`, `onkeydown`). Mounts/unmounts with the component lifecycle. Attaches keyboard listener to editor pane root element (NOT `document`). |
| `SaveFailureBanner.svelte` | impure | Svelte 5 component: renders conditional DOM based on `EditorViewState.status === 'save-failed'`. Owns the Retry/Discard/Cancel click handlers. |
| `timerModule.ts` | impure | Thin wrapper: `scheduleIdleSave(delayMs: number, callback: () => void): TimerHandle` and `cancelIdleSave(handle: TimerHandle): void`. Wraps `setTimeout` / `clearTimeout`. Injected as a dependency so tests can substitute a fake. |
| `clipboardAdapter.ts` | impure | Wraps `navigator.clipboard.writeText(text)` (or Tauri clipboard plugin if available). Produces `Promise<void>`. |
| `tauriEditorAdapter.ts` | impure | **OUTBOUND only.** Concrete implementation of the outbound side of the `EditorIpcAdapter` interface. Wraps Tauri `invoke(...)` calls for save/copy/new/retry/discard/cancel commands (`dispatchTriggerIdleSave`, `dispatchTriggerBlurSave`, `dispatchCopyNoteBody`, `dispatchRequestNewNote`, `dispatchRetrySave`, `dispatchDiscardCurrentSession`, `dispatchCancelSwitch`, `dispatchEditNoteBody`). Does NOT call `@tauri-apps/api/event listen(...)` and does NOT subscribe to state events. Concrete snake_case command names follow the existing convention but are deferred to the backend save-handler VCSDD feature. Integration tests inject a mock adapter, never the real `invoke()`. (ref: behavioral-spec.md §9 RD-003; §10; RD-016) |
| `keyboardListener.ts` | impure | Registers `panelRoot.addEventListener('keydown', ...)` on the editor pane root element (NOT `document.addEventListener`) for the Ctrl+N / Cmd+N shortcut (both platforms via `event.ctrlKey \|\| event.metaKey`). Dispatches `RequestNewNote { source: 'ctrl-N' }`. Teardown via returned cleanup function, called from `$effect` return. Scoped to editor pane only: does NOT fire when focus is outside the editor pane. (ref: behavioral-spec.md §9 RD-004; RD-008; REQ-EDIT-024) |
| `editorStateChannel.ts` | impure | **INBOUND only.** Implements `subscribeToState(handler: (state: EditingSessionState) => void): () => void` by calling `@tauri-apps/api/event listen('editing_session_state_changed', payload => handler(payload.payload.state))`. Does NOT call `invoke(...)` and does NOT dispatch any outbound commands. This is the sole entry point for all inbound `@tauri-apps/api/event listen(...)` calls from the editor. The pure tier never observes this channel. The impure shell stores the latest payload in a single `$state` and passes it through `editorReducer` as a `DomainSnapshotReceived` action. (ref: behavioral-spec.md §10; RD-011; RD-016) |

---

## 3. Verification Tier Assignments

### Tier 0 — Type-level / static guarantees (TypeScript compile-time)

Compile-time proofs require no test execution; they are enforced by `tsc --noEmit` in CI.

- **Exhaustive switch on `EditorViewState.status`**: Any switch in `editorReducer.ts` and `EditorPanel.svelte` that branches on `status` must include a `never`-check default branch. If a new status value is added to `EditorViewState` without updating the switch, the TypeScript compiler produces a type error.
- **Exhaustive switch on `SaveError.kind`** (and nested `reason.kind`): `bannerMessageFor` in `editorPredicates.ts` must cover all variants of `SaveError` — `{ kind: 'fs', reason: FsError }` and `{ kind: 'validation', reason: SaveValidationError }` — via exhaustive switch. Unhandled variants produce a compile-time `never` error.
- **Branded `SaveSource` type**: The `source` field on save commands produced by `ui-editor` uses the string literal union `'capture-idle' | 'capture-blur'` (drawn verbatim from the domain enum in domain-events.md:115). TypeScript enforces that `classifySource` returns only members of this union; passing `'idle'`, `'blur'`, `'switch'`, `'manual'`, or any other string is a compile error. (ref: behavioral-spec.md §9 RD-001)
- **`EditorAction` discriminated union**: `editorReducer.ts` accepts `EditorAction` — a discriminated union covering all possible UI-triggered actions. Adding a new action without handling it in the reducer switch is a compile-time error (exhaustive `never` branch required).
- **`EditorViewState` is not `EditingSessionState`**: `EditorViewState` is declared as a separate TypeScript type from `EditingSessionState`. No component constructs `EditingSessionState` directly. The type system enforces that `editorReducer` returns `EditorViewState`, not `EditingSessionState`. (ref: behavioral-spec.md §3.4a)

### Tier 1 — Pure unit tests (vitest, deterministic)

These tests call pure functions directly with controlled inputs. No fake timers, no mocks required.

- `editorPredicates.test.ts`: Example-based tests for every branch of `canCopy`, `isEmptyAfterTrim`, `bannerMessageFor`, and `classifySource`.
- `editorReducer.test.ts`: Example-based tests for all (status, action) pairs in the state transition table from `aggregates.md §CaptureSession`.
- `debounceSchedule.test.ts`: Example-based tests for `computeNextFireAt` and `shouldFireIdleSave` at boundary inputs (exactly at debounce threshold, one millisecond before, one after).

### Tier 2 — Property tests (fast-check, pure modules only)

Property tests generate randomised inputs via `fast-check` and assert invariants that must hold for all inputs within the domain.

- **PROP-EDIT-001** (`editorPredicates.ts`): Idempotent dirty detection — `isDirty(body, body)` is always `false` regardless of the body string.
- **PROP-EDIT-003** (`debounceSchedule.ts`): Debounce semantics — given any sequence of edit timestamps with quiescence of at least `debounceMs` before `nowMs`, `shouldFireIdleSave` returns `true`.
- **PROP-EDIT-004** (`debounceSchedule.ts`): Blur-cancels-idle — pure model version: given the last-blur timestamp `tb` is before a pending idle fire time `ts`, the schedule model reports that the blur save takes precedence (idle timer must not also fire).
- **PROP-EDIT-005** (`editorPredicates.ts`): Banner exhaustiveness — `bannerMessageFor` returns a non-empty string for every `{ kind: 'fs', reason: _ }` variant and `null` for every `{ kind: 'validation', reason: _ }` variant.
- **PROP-EDIT-006** (`editorPredicates.ts`): Copy-enable parity — for `status ∈ {'idle', 'switching', 'save-failed'}`, `canCopy === false` regardless of body content. For `status ∈ {'editing', 'saving'}`, `canCopy === !isEmptyAfterTrim(bodyStr)`. Tested over randomly generated body strings and all 5 status values.
- **PROP-EDIT-007** (`editorReducer.ts`): Reducer totality — for all (status, action) pairs in the cross-product, `editorReducer(state, action)` returns `{ state: EditorViewState, commands: ReadonlyArray<EditorCommand> }` where `state` is defined, never throws, and never produces a `status` value outside the 5-value enum. `commands` is a `ReadonlyArray` (never `undefined`); each element's `kind` is one of the 9 variants in §10 `EditorCommand` union. (ref: behavioral-spec.md §9 RD-010; verification-architecture.md §10)
- **PROP-EDIT-008** (`editorReducer.ts`): Reducer purity — calling `editorReducer(state, action)` twice with identical `(state, action)` arguments (same reference or deep-equal) always produces deep-equal `{ state, commands }`. The reducer is referentially transparent.
- **PROP-EDIT-009** (`editorReducer.ts`): Source-absence invariant — corollary of PROP-EDIT-002; subsumed by it (no separate test required). The reducer never inserts a `source` field into a save `EditorCommand` (`'trigger-idle-save'` or `'trigger-blur-save'`; see §10 EditorCommand union) that was not present in its action input. `source` is always one of `EditorCommandSaveSource` (`'capture-idle' | 'capture-blur'`). (ref: domain-events.md:115; behavioral-spec.md §9 RD-001; RD-015; verification-architecture.md §10)
- **PROP-EDIT-040** (`editorReducer.ts`): DomainSnapshotReceived mirroring — for any `s: EditorViewState` and any `S: EditingSessionState`, `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state` satisfies `state.status === S.status`, `state.isDirty === S.isDirty`, `state.currentNoteId === S.currentNoteId`, and `state.pendingNextNoteId === S.pendingNextNoteId`. The reducer performs no transformation, no partial copy, and no default override of the four mirrored fields. Tested by deterministic unit assertions (Tier 1, `editorReducer.test.ts`) and a fast-check property (Tier 2, `editorReducer.property.test.ts` property `'snapshot mirroring is identity over state fields'`). (ref: behavioral-spec.md §3.4a; REQ-EDIT-014; FIND-002 remediation)

### Tier 3 — Branch coverage gate (@vitest/coverage-v8)

Replaces Stryker mutation testing (not installed in `promptnotes/package.json`). The equivalent rigor is achieved by:
1. **fast-check property tests** on all pure modules (Tier 2 above) providing semantic-mutation resistance.
2. **Branch coverage ≥ 95%** on pure modules measured by `@vitest/coverage-v8` (the `provider: 'v8'` coverage package; installed as `"@vitest/coverage-v8": "^4.1.5"` in `promptnotes/package.json` devDependencies, matching the installed `"vitest": "^4.1.5"`).

**Phase 2 entry criterion**: `bun install` in `promptnotes/` must record `@vitest/coverage-v8` in `bun.lock` before any Red test referencing `--coverage` is written.

Scope (pure modules only — Svelte components and test helpers are excluded from this gate):
- `promptnotes/src/lib/editor/editorPredicates.ts`
- `promptnotes/src/lib/editor/editorReducer.ts`
- `promptnotes/src/lib/editor/debounceSchedule.ts`

Coverage exclude pattern: `**/__tests__/**, **/*.svelte` — Svelte components are integration-tier; their branch coverage is NOT counted toward this ≥ 95% gate.

Target: **≥ 95% branch coverage** per file as reported by `vitest --coverage --reporter=json`.

Run command: `bun run test:dom -- --coverage` inside `promptnotes/`.

### Integration tier — vitest + jsdom + raw Svelte 5 mount API

Integration tests verify the wiring between the pure core and the effectful shell. They follow the established pattern in `promptnotes/src/lib/ui/app-shell/__tests__/dom/AppShell.dom.vitest.ts` — using `import { mount, unmount, flushSync } from 'svelte'` directly, NOT `@testing-library/svelte`.

Files: `promptnotes/src/lib/editor/__tests__/*.dom.vitest.ts`

Pattern:
```typescript
import { mount, unmount, flushSync } from 'svelte';
import { vi } from 'vitest';
import EditorPanel from '../EditorPanel.svelte';

// Mock EditorIpcAdapter inline
const mockAdapter = {
  subscribeToState: vi.fn(),
  dispatchEditNoteBody: vi.fn(),
  // ...
};

// Mount component
const target = document.createElement('div');
document.body.appendChild(target);
const component = mount(EditorPanel, { target, props: { adapter: mockAdapter } });
flushSync();

// Assert DOM attributes
// Simulate domain state changes via mockAdapter.subscribeToState callback
// Clean up
unmount(component);
```

Notable responsibilities of the integration tier:
- Textarea `disabled` / `readonly` transitions across all 5 `EditorViewState.status` values.
- New Note button `disabled` attribute for all 5 states (per REQ-EDIT-023 enable matrix).
- Banner DOM presence and absence keyed on `status === 'save-failed'`.
- Retry / Discard / Cancel button click dispatch counts.
- Copy button `disabled` attribute toggling on body content changes.
- Ctrl+N keyboard shortcut with `event.preventDefault()` assertion (scoped to editor pane root, NOT document).
- `vi.useFakeTimers()` scenarios for idle debounce (REQ-EDIT-004, EC-EDIT-001).
- Blur-during-saving guard (EC-EDIT-002): `TriggerBlurSave` not dispatched when `status === 'saving'`.
- Inbound state update via mock `subscribeToState` callback + `flushSync()`.
- ARIA attribute assertions: `role`, `aria-disabled`, `aria-label`, `tabIndex` on all interactive elements (NFR-EDIT-001, NFR-EDIT-002) — verified via `element.getAttribute(...)`, no external a11y library.

---

## 4. Proof Obligations

The following table contains one `PROP-EDIT-XXX` entry for every REQ-EDIT-001..027 from Phase 1a. Where two requirements describe the same property from complementary angles, they are merged into a single PROP with both REQ IDs cited. Where a requirement is inherently integration-tier (DOM focus events, button click dispatch, ARIA attribute placement), `Required` is set to `false` and the integration test path is cited.

| PROP-ID | Requirement (REQ-EDIT-XXX) | Property Statement | Tier | Tool | Required | Pure-or-Shell |
|---|---|---|---|---|---|---|
| PROP-EDIT-001 | REQ-EDIT-001, REQ-EDIT-002 | `isDirty(body, body)` returns `false` for all string values of `body` (idempotent dirty: equal bodies are never dirty). Complementary: after a `NoteFileSaved` action, `editorReducer` returns `{ state: { isDirty: false, ... }, commands: [] }`. | 2 | fast-check | true | pure |
| PROP-EDIT-002 | REQ-EDIT-026 | Every `EditorCommand` in the `commands` array produced by `editorReducer` for any save-triggering action carries a `source` field drawn exclusively from `EditorCommandSaveSource` (`'capture-idle' \| 'capture-blur'`; see §10 EditorCommand union), and the value equals the `source` passed in the triggering action payload. The UI layer never omits, infers, or uses `'idle'`, `'blur'`, `'switch'`, `'manual'`, or any other string. The save-triggering variants of `EditorCommand` are `'trigger-idle-save'` and `'trigger-blur-save'` (see §10). (ref: domain-events.md:115; behavioral-spec.md §9 RD-001; RD-010) | 2 | fast-check | true | pure |
| PROP-EDIT-003 | REQ-EDIT-004, EC-EDIT-001 | Given any sequence of edit timestamps `{t1, ..., tn}` where `tn + debounceMs ≤ nowMs` and no edit occurs in `(tn, nowMs)`, `shouldFireIdleSave` returns `true` and `computeNextFireAt` returns `{ shouldFire: true, fireAt: tn + debounceMs }`. For rapid bursts (any edit within the debounce window), `shouldFireIdleSave` returns `false`. (ref: behavioral-spec.md §12) | 2 | fast-check | true | pure |
| PROP-EDIT-004 | REQ-EDIT-006, REQ-EDIT-007 | In the pure debounce schedule model: if a blur event is recorded at time `tb` while a pending idle save is scheduled for `ts > tb`, the schedule model reports that the idle save should NOT fire at `ts`; only the blur save should be emitted. Blur and idle saves do not both fire for the same dirty interval. | 2 | fast-check | true | pure |
| PROP-EDIT-005 | REQ-EDIT-015, REQ-EDIT-016 | `bannerMessageFor(error)` returns a non-empty string for every `SaveError` with `kind === 'fs'` (all four `FsError` reason variants: `permission`, `disk-full`, `lock`, `unknown`). `bannerMessageFor` returns `null` for every `SaveError` with `kind === 'validation'` (both `empty-body-on-idle` and `invariant-violated`). The function is total: it never throws and never returns `undefined`. | 2 | fast-check + tsc exhaustive switch | true | pure |
| PROP-EDIT-006 | REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006 | For `status ∈ {'idle', 'switching', 'save-failed'}`, `canCopy(bodyStr, status) === false` regardless of body content. For `status ∈ {'editing', 'saving'}`, `canCopy(bodyStr, status) === !isEmptyAfterTrim(bodyStr)`. Tested over randomly generated body strings and all 5 status values. (ref: behavioral-spec.md §9 RD-006) | 2 | fast-check | true | pure |
| PROP-EDIT-007 | REQ-EDIT-009, REQ-EDIT-010, REQ-EDIT-011, REQ-EDIT-012, REQ-EDIT-013 | `editorReducer(state, action)` returns `{ state: EditorViewState, commands: ReadonlyArray<EditorCommand> }` for every (status, action) pair, where `EditorCommand` is the 9-variant discriminated union defined in §10. The returned `state` is defined, never `undefined`. The `state.status` is always one of `'idle' \| 'editing' \| 'saving' \| 'switching' \| 'save-failed'`. `commands` is always a `ReadonlyArray` (never `undefined`); each element's `kind` is one of the 9 variants in §10. The function never throws. `isDirty` transitions: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained. (ref: aggregates.md:258,273–276; behavioral-spec.md §9 RD-005; RD-010; verification-architecture.md §10) | 2 | fast-check | true | pure |
| PROP-EDIT-008 | REQ-EDIT-014 | Calling `editorReducer(state, action)` twice with identical `(state, action)` arguments (same reference or deep-equal) always produces deep-equal `{ state, commands }`. The reducer is referentially transparent: no global mutable state, no `Date.now()`, no randomness. `isDirty` transitions are synchronous and deterministic. (ref: aggregates.md:273–276; behavioral-spec.md §9 RD-005; RD-010) | 2 | fast-check | true | pure |
| PROP-EDIT-009 | REQ-EDIT-026 | **Source-absence invariant** (corollary of PROP-EDIT-002; no separate test required — subsumed by PROP-EDIT-002; see RD-015): the reducer never inserts a `source` field into a save `EditorCommand` (`'trigger-idle-save'` or `'trigger-blur-save'`; see §10 `EditorCommand` union) that was not present in its action input. Concretely, for any save-triggering action whose payload carries `source: S ∈ EditorCommandSaveSource`, the reducer's output `commands` array contains no `EditorCommand` with a `source` value other than `S`. This is the *absence* dual of PROP-EDIT-002's *equality* assertion; together they constitute the full pass-through contract. (ref: domain-events.md:115; behavioral-spec.md §9 RD-001; RD-010; verification-architecture.md §10) | 2 | fast-check | false | pure |
| PROP-EDIT-010 | REQ-EDIT-005, REQ-EDIT-002 | After a `NoteFileSaved` action, `editorReducer` transitions the state such that `state.isDirty === false` and `commands` does not include a re-fire idle-save command. The idle-timer-cancel decision is encoded in the `commands` output as `{ kind: 'cancel-idle-timer' }` (see §10 `EditorCommand` union); the actual `clearTimeout` call happens in the impure shell reacting to the `commands` array. The impure shell must handle `{ kind: 'cancel-idle-timer' }` via exhaustive switch (§10 Tier 0 obligation). | 1 | vitest | true | pure |
| PROP-EDIT-011 | REQ-EDIT-008, EC-EDIT-002 | `editorReducer` applied to `(state_with_status_saving, { kind: 'BlurEvent' })` returns `{ state: { status: 'saving', ... }, commands: [] }` — no `TriggerBlurSave` command in the output. The guard is encoded in the pure reducer's `commands` output. | 1 | vitest | true | pure |
| PROP-EDIT-012 | REQ-EDIT-017 | Activating the Retry button in `status === 'save-failed'` dispatches `RetrySave` exactly once via the mock `EditorIpcAdapter`. The banner DOM node disappears when the mock adapter emits a domain state snapshot with `status === 'saving'`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-013 | REQ-EDIT-018 | Activating the Discard button dispatches `DiscardCurrentSession` exactly once via the mock adapter. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-014 | REQ-EDIT-019 | Activating the Cancel button dispatches `CancelSwitch` exactly once. The banner disappears when domain snapshot transitions to `editing`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-015 | REQ-EDIT-020, NFR-EDIT-007 | The save-failure banner Svelte source file contains the literal 5-layer Deep Shadow string; the left accent uses `#dd5b00`; `border-radius` is `8px`. Button typography source contains `font-size: 15px` and `font-weight: 600`. Verified by grep of the component source file (not by jsdom `getComputedStyle` — jsdom does not reliably resolve scoped Svelte CSS). | Integration + style grep | vitest grep-based source assertion + DESIGN.md manual checklist | false | shell — integration test: `save-failure-banner.dom.vitest.ts` + manual style review |
| PROP-EDIT-016 | REQ-EDIT-021 | Copy button click dispatches `CopyNoteBody` with the current `noteId` when `canCopy === true`. No dispatch when `canCopy === false`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-017 | REQ-EDIT-022 | Copy button has `disabled` attribute and `aria-disabled="true"` in `idle`, `switching`, `save-failed` states and when body is whitespace-only. Text color `#a39e98` is asserted via grep of component source. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-018 | REQ-EDIT-023 | "+ 新規" button click dispatches `RequestNewNote` with `source: 'explicit-button'`. The button is `disabled` only in `switching` state; enabled in all other states. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-019 | REQ-EDIT-024, EC-EDIT-007 | Keydown event on the editor pane root element with `ctrlKey=true, key='n'` dispatches `RequestNewNote` with `source: 'ctrl-N'`, calls `event.preventDefault()`, and does not insert `'n'` into the textarea. No dispatch when keydown fires on `document` directly (listener is editor-pane-scoped). | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-020a | REQ-EDIT-025 (`editing` state sub-case) | When `RequestNewNote` is dispatched while `EditorViewState.status === 'editing'` AND `isDirty === true`, `TriggerBlurSave { source: 'capture-blur' }` is dispatched before any new-note intent is processed. `RequestNewNote` is not dispatched until the domain snapshot transitions out of `saving`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-020b | REQ-EDIT-025, EC-EDIT-008 (`save-failed` state sub-case) | When `RequestNewNote` is dispatched while `EditorViewState.status === 'save-failed'`, the UI dispatches `RequestNewNote` directly **without a preceding `TriggerBlurSave`**. The mock adapter records `RequestNewNote` as the first call, not `TriggerBlurSave`. (ref: behavioral-spec.md §9 RD-009) | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-021 | REQ-EDIT-001 | Each textarea `input` event dispatches `EditNoteBody` carrying the full current body string, and the `EditorViewState.isDirty` derived from the mirrored state becomes `true` (optimistic mirror, before domain snapshot). | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-022 | REQ-EDIT-006, EC-EDIT-002 | Textarea blur event while `isDirty === true` dispatches `TriggerBlurSave { source: 'capture-blur' }` exactly once (spy on mock adapter) and cancels any pending idle timer (spy on `timerModule.cancelIdleSave`). Blur while `status === 'saving'` dispatches nothing. (ref: domain-events.md:115; behavioral-spec.md §9 RD-001) | Integration | vitest + jsdom + Svelte 5 mount + `vi.useFakeTimers()` | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-023 | REQ-EDIT-004, EC-EDIT-001 | With `vi.useFakeTimers()`: after the last `EditNoteBody` dispatch, advancing time by exactly `IDLE_SAVE_DEBOUNCE_MS` (2000ms) fires `TriggerIdleSave { source: 'capture-idle' }` exactly once. Advancing time by `IDLE_SAVE_DEBOUNCE_MS - 1` fires nothing. During a continuous burst, each new input resets the timer and no intermediate fire occurs. (ref: domain-events.md:115; behavioral-spec.md §9 RD-001) | Integration | vitest + jsdom + Svelte 5 mount + `vi.useFakeTimers()` | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-024 | REQ-EDIT-009 | In `status === 'idle'`: the Body textarea is `readonly` or absent from the DOM; Copy button has `disabled` and `aria-disabled="true"`; a placeholder message is present; New Note button is enabled (not `disabled`). | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-025 | REQ-EDIT-010 | In `status === 'editing'` with `isDirty === true`: textarea accepts input; a dirty indicator element is present in the DOM; Copy button is enabled when `body.trim().length > 0`; no error banner present. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-026 | REQ-EDIT-011 | In `status === 'saving'`: a save-in-progress indicator with `aria-label` containing "保存中" is present; textarea is not `disabled` and not `readonly`; `role="status"` is present; New Note button is enabled. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-027 | REQ-EDIT-012 | In `status === 'switching'`: textarea is `disabled` or `aria-disabled="true"`; Copy button is disabled; New Note button is `disabled` or `aria-disabled="true"`; a visual cue element indicating pending switch is present. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-028 | REQ-EDIT-013 | In `status === 'save-failed'`: save-failure banner is visible (`data-testid="save-failure-banner"`); textarea accepts input; Copy button is disabled; New Note button is enabled (not `disabled`). | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-029 | REQ-EDIT-014 | No `ui-editor` component source file contains a direct mutation of `EditingSessionState` or an `EditorViewState` setter outside `editorReducer`. Verified by: (a) `tsc --strict --noUncheckedIndexedAccess` (type-level), (b) grep: `grep -r "EditingSessionState" src/lib/editor/*.svelte` must show only read access patterns (no `=` assignment to its fields). | 0 | `tsc --strict` + grep audit | true | pure/shell boundary — CI |
| PROP-EDIT-030 | REQ-EDIT-015 | The save-failure banner is present in the DOM when `status === 'save-failed'` and absent in all other states. The banner root element has `role="alert"` and `data-testid="save-failure-banner"`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-031 | REQ-EDIT-016 | `bannerMessageFor({ kind: 'fs', reason: { kind: 'permission' } })` returns `'保存に失敗しました（権限不足）'`. Equivalent assertions for `disk-full`, `lock`, `unknown`. `bannerMessageFor({ kind: 'validation', ... })` returns `null`. The TypeScript switch is exhaustive (compile-time). | 1 | vitest | true | pure |
| PROP-EDIT-032 | REQ-EDIT-027, REQ-EDIT-016 | When `EditorViewState` carries a `SaveValidationError.kind === 'invariant-violated'`, no inline error message is rendered in the editor UI and `console.error` is called. When `kind === 'empty-body-on-idle'`, no inline error is shown; the successor `EditorViewState` has `status === 'editing'` and `isDirty === false`. Textarea is never `disabled` due to a validation error alone. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-validation.dom.vitest.ts` |
| PROP-EDIT-033 | NFR-EDIT-001, NFR-EDIT-002 | All interactive elements (textarea, Copy button, New Note button, Retry, Discard, Cancel) have non-negative `tabIndex` when enabled (verified via `element.getAttribute('tabindex')`). Saving indicator has `role="status"`. Banner has `role="alert"`. `aria-disabled` is `"true"` on disabled buttons. No `axe-core` dependency required. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-accessibility.dom.vitest.ts` |
| PROP-EDIT-034 | NFR-EDIT-003, NFR-EDIT-004, EC-EDIT-009 | The idle debounce timer uses a single handle per edit cycle (spy on `timerModule.scheduleIdleSave` call count per burst). The `oninput` handler completes synchronously without `await`. OS-sleep/resume scenario (EC-EDIT-009) is accepted as environment-dependent and covered only by the timer mock test (PROP-EDIT-023). | Integration | vitest + jsdom + Svelte 5 mount + `vi.useFakeTimers()` | false | shell — integration test: `editor-panel.dom.vitest.ts` |
| PROP-EDIT-035 | NFR-EDIT-005, NFR-EDIT-006, NFR-EDIT-007 | All hex / rgba / px values in `ui-editor` component and TypeScript files are members of the DESIGN.md §10 Token Reference allow-list. Button text source contains `font-size: 15px` and `font-weight: 600`. No `font-weight` value outside `{400, 500, 600, 700}`. Verified via DESIGN.md manual review checklist and grep of component source files. | Manual review checklist + grep | DESIGN.md manual audit; `grep -r "font-weight" src/lib/editor/` | false | shell — manual review |
| PROP-EDIT-036 | NFR-EDIT-008 | No `import { writable } from 'svelte/store'` exists in any `ui-editor` source file for editor-internal state. All local state uses `$state(...)`. `EditingSessionState` is not mutated inside any component. Verified by: (a) `grep -r "from 'svelte/store'" src/lib/editor/` must return zero hits, (b) `tsc --strict` catches mutation attempts. | 0 | grep audit + `tsc --strict` | true | pure/shell boundary — CI |
| PROP-EDIT-037 | EC-EDIT-003 | In `status === 'save-failed'`, continued textarea input continues to dispatch `EditNoteBody` and the banner remains visible. The idle debounce timer continues to run (spy on `timerModule.scheduleIdleSave`). `isDirty` remains `true` in `EditorViewState`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-038 | EC-EDIT-004 | `DiscardCurrentSession` dispatched from the banner propagates to the mock adapter regardless of the current save in-flight status. The UI does not cancel the Tauri IPC call; it only dispatches the command and reflects the returned state. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-039 | EC-EDIT-005 | In `status === 'switching'` (driven by domain snapshot via mock adapter): textarea is locked; New Note button is `disabled`; idle timer is cancelled (spy on `timerModule.cancelIdleSave`). When domain snapshot transitions to `editing` with new note content, textarea is re-enabled. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — integration test: `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-040 | REQ-EDIT-014 | DomainSnapshotReceived mirroring: `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.{status, isDirty, currentNoteId, pendingNextNoteId} === S.{status, isDirty, currentNoteId, pendingNextNoteId}` for any `s` and any `S`. The reducer performs no transformation, no partial copy, and no default override of the four mirrored fields. | 2 | fast-check + vitest | true | Pure |

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

### Component / integration tests (DOM tier)

Path pattern: `promptnotes/src/lib/editor/__tests__/*.dom.vitest.ts`

Pattern: vitest + jsdom + `mount`/`unmount`/`flushSync` from `svelte` + `vi.fn()` mock adapter (NO `@testing-library/svelte`)

Files:
- `promptnotes/src/lib/editor/__tests__/editor-panel.dom.vitest.ts` — PROP-EDIT-016 through PROP-EDIT-023, PROP-EDIT-020a, PROP-EDIT-020b, PROP-EDIT-034
- `promptnotes/src/lib/editor/__tests__/editor-session-state.dom.vitest.ts` — PROP-EDIT-024 through PROP-EDIT-028, PROP-EDIT-037, PROP-EDIT-039
- `promptnotes/src/lib/editor/__tests__/save-failure-banner.dom.vitest.ts` — PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-015, PROP-EDIT-030, PROP-EDIT-038
- `promptnotes/src/lib/editor/__tests__/editor-validation.dom.vitest.ts` — PROP-EDIT-032
- `promptnotes/src/lib/editor/__tests__/editor-accessibility.dom.vitest.ts` — PROP-EDIT-033

Test environment: vitest + jsdom + raw Svelte 5 mount API + `vi.useFakeTimers()` for timer scenarios

Run command: `bun run test:dom` (or `bun run test`) inside `promptnotes/`

### Branch coverage (Tier 3 replacement for Stryker)

Package: `@vitest/coverage-v8` (`"@vitest/coverage-v8": "^4.1.5"` in `promptnotes/package.json` devDependencies; `provider: 'v8'` in vitest config)

Scope (pure modules only):
```
src/lib/editor/editorPredicates.ts
src/lib/editor/editorReducer.ts
src/lib/editor/debounceSchedule.ts
```

Exclude pattern: `**/__tests__/**, **/*.svelte`

Run command: `bun run test:dom -- --coverage` inside `promptnotes/`

Target: **≥ 95% branch coverage** per file.

Note: Stryker (`@stryker-mutator/*`) is NOT installed in `promptnotes/package.json` and MUST NOT be referenced as a gate. The equivalent semantic rigor is provided by fast-check property tests (Tier 2) combined with ≥95% branch coverage measured by `@vitest/coverage-v8`.

### Static / lint checks

- `tsc --noEmit --strict --noUncheckedIndexedAccess` inside `promptnotes/` — enforces Tier 0 exhaustive switch guarantees and state ownership boundary
- Purity audit grep (Phase 5 gate): see canonical pattern in §2 — must return zero hits on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`
- SVelte 4 store audit grep: `grep -r "from 'svelte/store'" src/lib/editor/` — must return zero hits (PROP-EDIT-036)
- EditingSessionState mutation audit grep: `grep -r "EditingSessionState" src/lib/editor/*.svelte` — no assignment patterns (PROP-EDIT-029)
- Design-token manual review: DESIGN.md conformance checklist applied to all `src/lib/editor/*.svelte` source files during Phase 3 adversarial review

---

## 6. Coverage Matrix

Every REQ-EDIT-001..027 and EC-EDIT-001..010 must appear in the following table.

| ID | PROP-EDIT-XXX | Tier | Test path |
|---|---|---|---|
| REQ-EDIT-001 | PROP-EDIT-001 (pure), PROP-EDIT-021 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-002 | PROP-EDIT-001 (pure), PROP-EDIT-010 (pure) | 1 + 2 | `editorPredicates.property.test.ts`, `editorReducer.test.ts` |
| REQ-EDIT-003 | PROP-EDIT-006 (pure), PROP-EDIT-017 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-004 | PROP-EDIT-003 (pure), PROP-EDIT-023 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-005 | PROP-EDIT-010 | 1 | `editorReducer.test.ts` |
| REQ-EDIT-006 | PROP-EDIT-004 (pure), PROP-EDIT-022 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-007 | PROP-EDIT-004 (pure), PROP-EDIT-022 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-008 | PROP-EDIT-011 (pure), PROP-EDIT-022 (integration) | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-009 | PROP-EDIT-024 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-010 | PROP-EDIT-025 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-011 | PROP-EDIT-026 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-012 | PROP-EDIT-027 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-013 | PROP-EDIT-028 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-014 | PROP-EDIT-029 (state ownership boundary), PROP-EDIT-040 (snapshot mirroring, Tier 2 fast-check) | 0 + 2 | `tsc --strict`, grep audit, `editorReducer.test.ts`, `editorReducer.property.test.ts` |
| REQ-EDIT-015 | PROP-EDIT-030 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-016 | PROP-EDIT-005 (pure), PROP-EDIT-031 (pure), PROP-EDIT-032 (integration) | 1 + 2 + Integration | `editorPredicates.test.ts`, `editorPredicates.property.test.ts`, `editor-validation.dom.vitest.ts` |
| REQ-EDIT-017 | PROP-EDIT-012 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-018 | PROP-EDIT-013 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-019 | PROP-EDIT-014 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-020 | PROP-EDIT-015 | Integration + style grep | `save-failure-banner.dom.vitest.ts`, manual DESIGN.md review |
| REQ-EDIT-021 | PROP-EDIT-016 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-022 | PROP-EDIT-006 (pure), PROP-EDIT-017 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-023 | PROP-EDIT-018 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-024 | PROP-EDIT-019 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-025 | PROP-EDIT-020a, PROP-EDIT-020b | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-026 | PROP-EDIT-002 (required); PROP-EDIT-009 subsumed by PROP-EDIT-002 (see RD-015) | 2 | `editorReducer.property.test.ts` |
| REQ-EDIT-027 | PROP-EDIT-032 | Integration | `editor-validation.dom.vitest.ts` |
| EC-EDIT-001 | PROP-EDIT-003, PROP-EDIT-023 | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-002 | PROP-EDIT-011, PROP-EDIT-022 | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-003 | PROP-EDIT-037 | Integration | `editor-session-state.dom.vitest.ts` |
| EC-EDIT-004 | PROP-EDIT-038 | Integration | `save-failure-banner.dom.vitest.ts` |
| EC-EDIT-005 | PROP-EDIT-039 | Integration | `editor-session-state.dom.vitest.ts` |
| EC-EDIT-006 | PROP-EDIT-006, PROP-EDIT-017 | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-007 | PROP-EDIT-019, PROP-EDIT-020a | Integration | `editor-panel.dom.vitest.ts` |
| EC-EDIT-008 | PROP-EDIT-020b | Integration | `editor-panel.dom.vitest.ts` |
| EC-EDIT-009 | PROP-EDIT-034 | Integration | `editor-panel.dom.vitest.ts` |
| EC-EDIT-010 | PROP-EDIT-018, PROP-EDIT-026 | Integration | `editor-panel.dom.vitest.ts`, `editor-session-state.dom.vitest.ts` |

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

- 100% branch coverage of the pure core (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) as reported by `vitest --coverage`.
- 100% of `PROP-EDIT-XXX` with `Required: true` must pass.
- All integration-tier tests must pass.

### Phase 5 gate (formal hardening criterion)

- **Branch coverage gate**: ≥ 95% branch coverage on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts` as reported by `bun run test:dom -- --coverage --reporter=json` (provider: `@vitest/coverage-v8`; exclude pattern: `**/__tests__/**, **/*.svelte`). (Replaces Stryker — not installed.)
- **Security audit**: grep for `{@html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` inside `src/lib/editor/**` must return zero hits.
- **Purity audit**: grep using the canonical pattern from §2 against `src/lib/editor/editorPredicates.ts`, `src/lib/editor/editorReducer.ts`, and `src/lib/editor/debounceSchedule.ts` must return zero hits. Pure-tier modules MUST NOT import `@tauri-apps/api` under any circumstances.
- **Type safety audit**: `tsc --noEmit --strict --noUncheckedIndexedAccess` inside `promptnotes/` must exit 0.
- **Svelte 4 store audit**: `grep -r "from 'svelte/store'" src/lib/editor/` must return zero hits (PROP-EDIT-036).
- **State mutation audit**: `grep -r "EditingSessionState" src/lib/editor/*.svelte` must show no assignment patterns — verified by `tsc --strict` and grep. (PROP-EDIT-029)
- **Design-token manual checklist**: DESIGN.md conformance review of all `src/lib/editor/*.svelte` source files — colours, font-weights, border-radii, and the 5-layer shadow string must all match DESIGN.md §10 Token Reference.

---

## 8. Threat Model & Security Properties

### Body content trust boundary

The `body` field is raw user-supplied text. It is displayed in the editor textarea and copied to the clipboard. Svelte text bindings (`{body}`, `bind:value`) escape HTML by default, which prevents reflected XSS in the Svelte template layer.

**Prohibition**: The `{@html body}` directive must never be used anywhere in `ui-editor` components to display editor body content. The Phase 5 security audit grep (`{@html`) will catch any violation.

The `data-testid` attributes and ARIA labels are hard-coded string literals; they never interpolate user data.

### Clipboard surface

When `CopyNoteBody` writes `note.bodyForClipboard()` to the clipboard, the content is the raw body string including any control characters or very long content. This is intentional and acceptable: the clipboard is a direct user action, and no sanitisation is applied. The domain's `bodyForClipboard()` method (as specified in `aggregates.md`) guarantees only that frontmatter is excluded; it makes no further transformations.

### Tauri IPC

The `tauriEditorAdapter.ts` module is the sole entry point for all Tauri `invoke(...)` calls from the editor (OUTBOUND). The `editorStateChannel.ts` module is the sole entry point for all Tauri `@tauri-apps/api/event listen(...)` calls from the editor (INBOUND). These two modules do NOT overlap: `tauriEditorAdapter.ts` never calls `listen(...)` and `editorStateChannel.ts` never calls `invoke(...)`. (ref: RD-016) **The `ui-editor` feature does NOT define or hard-code Tauri command name strings.** Concrete IPC wiring (snake_case command names) is deferred to the backend save-handler VCSDD feature when the Rust command handlers are implemented. (ref: behavioral-spec.md §9 RD-003)

**Phase 5 purity audit note**: pure-tier modules (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) MUST NOT contain any `import` from `@tauri-apps/api`. The Phase 5 grep audit covers this via the canonical purity-audit pattern in §2.

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

All command payloads carry only typed value-object fields defined in `docs/domain/` type contracts; brand types (`Body`, `Timestamp`, `NoteId`) are sent as raw `string` values at the Tauri wire boundary, and the Rust domain constructs the brand types via `try_new_*`. (ref: behavioral-spec.md §11)

---

## 10. EditorCommand Discriminated Union

This section resolves FIND-021: the `EditorCommand` union contract between the pure reducer and the impure shell.

### Canonical union definition

```typescript
type EditorCommand =
  | { kind: 'edit-note-body';           payload: { noteId: string; newBody: string; issuedAt: string; dirty: true } }
  | { kind: 'trigger-idle-save';        payload: { source: 'capture-idle'; noteId: string; body: string; issuedAt: string } }
  | { kind: 'trigger-blur-save';        payload: { source: 'capture-blur'; noteId: string; body: string; issuedAt: string } }
  | { kind: 'cancel-idle-timer' }
  | { kind: 'retry-save';               payload: { noteId: string; body: string; issuedAt: string } }
  | { kind: 'discard-current-session';  payload: { noteId: string } }
  | { kind: 'cancel-switch';            payload: { noteId: string } }
  | { kind: 'copy-note-body';           payload: { noteId: string; body: string } }
  | { kind: 'request-new-note';         payload: { source: 'explicit-button' | 'ctrl-N'; issuedAt: string } }
```

**Source of names**: kind strings and `source` literal values are derived from `docs/domain/domain-events.md` (command dispatch names) and `docs/domain/ui-fields.md` (source enum values). The `'capture-idle'` and `'capture-blur'` values are the canonical domain enum members (domain-events.md:115; behavioral-spec.md §9 RD-001). The `source` values for `request-new-note` match RD-002.

> **Purity note**: Pure modules MUST NOT call `Date.now()` — `issuedAt` is supplied by the impure shell on the inbound `EditorAction`.

### Save-source subset alias

For use in PROP-EDIT-002/009 assertions:

```typescript
type EditorCommandSaveSource = 'capture-idle' | 'capture-blur';
// Used in: EditorCommand['trigger-idle-save']['payload']['source']
//          EditorCommand['trigger-blur-save']['payload']['source']
```

### Tier 0 structural-conformance assertions (impure shell)

Every variant's payload field set must be a strict superset of (or equal to) the corresponding `dispatchXxx` adapter signature's parameter set. The following compile-time assertions must appear in the impure shell's source and are audited at Tier 0:

```typescript
// Asserts 'edit-note-body' payload covers the dispatchEditNoteBody wire fields
type _AssertEditNoteBodyShape = (EditorCommand & { kind: 'edit-note-body' })['payload'] satisfies
  { noteId: string; newBody: string; issuedAt: string; dirty: true };

// Asserts 'copy-note-body' payload covers the dispatchCopyNoteBody wire fields
type _AssertCopyNoteBodyShape = (EditorCommand & { kind: 'copy-note-body' })['payload'] satisfies
  { noteId: string; body: string };
```

These assertions are compile-time only (`type` aliases, never emitted to JS). If the union definition drifts from the adapter signature, the build fails.

### Tier 0 exhaustive-switch obligation (impure shell)

The impure shell must handle every `EditorCommand` variant via an exhaustive switch on `kind`. Adding a new variant without updating the switch is a TypeScript compile error (`never` branch). This parallels the `EditorAction` exhaustive-switch guarantee in §3 Tier 0.

### PROP cross-references

| PROP-ID | `EditorCommand` variants referenced |
|---|---|
| PROP-EDIT-002 | `'trigger-idle-save'`, `'trigger-blur-save'` (save-source literals) |
| PROP-EDIT-007 | all variants (totality: `commands: ReadonlyArray<EditorCommand>` never undefined) |
| PROP-EDIT-009 | `'trigger-idle-save'`, `'trigger-blur-save'` (source-absence invariant, subsumed by PROP-EDIT-002) |
| PROP-EDIT-010 | `'cancel-idle-timer'` (clearTimeout delegation) |

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
- **Rust-side `note.isEmpty()` ↔ TypeScript `isEmptyAfterTrim` agreement proof**: this is a Kani obligation on the backend save-handler feature. The TypeScript spec pins `isEmptyAfterTrim = body.trim().length === 0` (ECMAScript `String.prototype.trim`) and notes that Rust must agree. (ref: behavioral-spec.md §9 RD-006)
