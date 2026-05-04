# Purity Audit — ui-editor (Phase 5)

## Feature: ui-editor | Date: 2026-05-04

---

## Declared Boundaries

Source: `verification-architecture.md §2` (canonical purity-audit pattern) and `§3` (tier assignments).

### Pure core modules (forbidden APIs: none may appear at runtime)

| Module | Layer | Forbidden API pattern |
|---|---|---|
| `editorPredicates.ts` | pure | Full canonical pattern from §2 |
| `editorReducer.ts` | pure | Full canonical pattern from §2 |
| `debounceSchedule.ts` | pure | Full canonical pattern from §2 |
| `types.ts` | pure (types only) | Full canonical pattern from §2 |

**Canonical forbidden-API pattern** (from `verification-architecture.md §2`):
```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|
requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|
XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|
\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

### Effectful shell modules (forbidden APIs permitted in these files)

| Module | Permitted effects |
|---|---|
| `EditorPane.svelte` | `$state`, `$derived`, `$effect`, DOM event handlers, `Date.now()` (via injected clock) |
| `debounceTimer.ts` | `setTimeout`, `clearTimeout` |
| `clipboardAdapter.ts` | `navigator.clipboard.writeText` |
| `tauriEditorAdapter.ts` | `invoke(...)` from `@tauri-apps/api/core` |
| `editorStateChannel.ts` | `listen(...)` from `@tauri-apps/api/event` |
| `keyboardListener.ts` | `addEventListener`, `removeEventListener` on DOM element |

---

## Observed Boundaries

### Audit command
```bash
grep -nE 'setTimeout|setInterval|Date\.now|new Date|Math\.random|crypto\.|performance\.|fetch\(|localStorage|sessionStorage|indexedDB|window\.|document\.|navigator|requestAnimationFrame|requestIdleCallback|globalThis|self\.|import\.meta|clearTimeout|clearInterval|@tauri-apps/api|invoke\(|\$state|\$derived|\$effect' \
  promptnotes/src/lib/editor/types.ts \
  promptnotes/src/lib/editor/editorPredicates.ts \
  promptnotes/src/lib/editor/editorReducer.ts \
  promptnotes/src/lib/editor/debounceSchedule.ts
```

### Results

**`types.ts`** — 5 hits, all in a JSDoc block comment (lines 9-13):
```
 * Math.random, crypto, performance, window, globalThis, self, document,
 * navigator, requestAnimationFrame, requestIdleCallback, localStorage,
 * sessionStorage, indexedDB, fetch, XMLHttpRequest, setTimeout, setInterval,
 * clearTimeout, clearInterval, Date.now, Date(, new Date, $state, $effect,
 * $derived, import.meta, invoke(, @tauri-apps/api
```
These are prohibition reminders in the module-level JSDoc, explicitly listing the forbidden APIs. No runtime calls. Classification: legitimate comment-only references.

**`editorPredicates.ts`** — ZERO hits.

**`editorReducer.ts`** — ZERO hits.

**`debounceSchedule.ts`** — 3 hits, all in JSDoc comment lines:
- Line 8: `* This module NEVER calls Date.now() — the caller provides nowMs.`
- Line 19: `* last edit. Used to schedule the setTimeout delay in the impure shell.`
- Line 68: `* - nowMs: current clock time (supplied by caller, never Date.now())`

All three are prohibition acknowledgments in JSDoc comments. No runtime calls. Classification: legitimate comment-only references, allowed per spec.

### editorReducer.ts import audit
```typescript
import type { EditorViewState, EditorAction, EditorCommand, NewNoteSource } from './types.js';
import { canCopy } from './editorPredicates.js';
```
Only pure-tier imports. No `@tauri-apps/api` import. PASS.

### editorPredicates.ts import audit
```typescript
import type { EditingSessionStatus, FsError, SaveError } from './types.js';
```
Only pure-tier type imports. No `@tauri-apps/api` import. PASS.

### debounceSchedule.ts import audit
No import statements at all beyond the module exports. PASS.

---

## DomainSnapshotReceived mirroring verification (PROP-EDIT-040)

The reducer's `DomainSnapshotReceived` handler (editorReducer.ts:118-165) mirrors the four declared fields directly from the snapshot into the view state:

```typescript
const nextState: EditorViewState = {
  ...state,           // spread of all existing fields
  status: snapshot.status,                     // mirrored
  isDirty: snapshot.isDirty,                   // mirrored
  currentNoteId: snapshot.currentNoteId,       // mirrored
  pendingNextNoteId: snapshot.pendingNextNoteId, // mirrored
  lastError: snapshot.lastError,               // also mirrored (spec allows additional fields)
  body: snapshot.body,                         // also mirrored
  pendingNewNoteIntent: resolvedIntent,        // REDUCER-OWNED: deferred intent resolution
};
```

The `pendingNewNoteIntent` field is the one field that the reducer manages internally (it resolves deferred new-note intents when save outcomes arrive). This is correct behavior per behavioral-spec.md §3.4a: the reducer owns UI-only orchestration state that has no corresponding domain field. The four spec-required mirror fields (`status`, `isDirty`, `currentNoteId`, `pendingNextNoteId`) are passed through without transformation. PROP-EDIT-040 is proved by fast-check (≥200 runs).

---

## Shell modules: purity boundary compliance

Spot-checking effectful modules to confirm forbidden APIs appear only in shell files:

### EditorPane.svelte
- `$state`, `$derived`, `$effect`: present (Svelte 5 reactivity — expected in shell)
- `Date.now()`: accessed via injected `clock.now()` — correct injection seam
- No direct `setTimeout` or `clearTimeout`: delegated to injected `timer` module — PASS
- No `@tauri-apps/api` import: all IPC delegated to injected `adapter` and `stateChannel` — PASS

### debounceTimer.ts (shell)
- `setTimeout` / `clearTimeout`: present (expected — this IS the timer shell module)
- No `@tauri-apps/api` import — PASS

### tauriEditorAdapter.ts (shell)
- `invoke` from `@tauri-apps/api/core`: present (expected — this IS the IPC shell module)
- No `listen(...)` — PASS (IPC separation maintained)

### editorStateChannel.ts (shell)
- `listen` from `@tauri-apps/api/event`: present (expected — this IS the event subscription module)
- No `invoke(...)` — PASS (IPC separation maintained)

### clipboardAdapter.ts (shell)
- `navigator.clipboard.writeText`: present (expected — this IS the clipboard shell module)

### keyboardListener.ts (shell)
- `addEventListener` / `removeEventListener` on injected DOM element: present (expected)
- Scoped to editor pane root element — NOT `document.addEventListener` — PASS

---

## Summary

| Check | Result | Detail |
|---|---|---|
| Forbidden APIs in `editorPredicates.ts` | PASS | Zero runtime hits |
| Forbidden APIs in `editorReducer.ts` | PASS | Zero runtime hits |
| Forbidden APIs in `debounceSchedule.ts` | PASS | 3 comment-only references (prohibition reminders) |
| Forbidden APIs in `types.ts` | PASS | 5 comment-only references (prohibition list in JSDoc) |
| `@tauri-apps/api` import in pure modules | PASS | Zero import statements |
| `invoke()` / `listen()` separation | PASS | Each confined to its designated shell module |
| `setTimeout` / `clearTimeout` in pure modules | PASS | Zero; delegated to injected shell |
| `Date.now()` in pure modules | PASS | Zero; debounceSchedule accepts `nowMs` from caller |
| `$state` / `$effect` / `$derived` in pure modules | PASS | Zero; Svelte reactives confined to `EditorPane.svelte` |
| DomainSnapshotReceived mirroring (PROP-040) | PASS | 4 required fields mirrored verbatim; proved by fast-check |
| Core/shell drift | None detected | All effectful modules correctly categorized as shell |

**Purity verdict: PASS**

No drift detected between declared and observed purity boundaries. All pure modules are free of forbidden APIs at runtime. The `debounceSchedule.ts` comment-only references to `Date.now()` and `setTimeout` are explicit prohibition acknowledgments, not violations.

### Required follow-up before Phase 6

None. All purity boundaries are clean and consistent with the declared architecture.
