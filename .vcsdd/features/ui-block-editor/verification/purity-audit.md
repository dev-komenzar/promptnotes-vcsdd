# Purity Boundary Audit

## Feature: ui-block-editor | Phase: 5 (Formal Hardening) | Date: 2026-05-09

---

## Declared Boundaries

Source of truth: `specs/verification-architecture.md` §2 (Purity Boundary Map)

### Pure Core Modules (canonical purity-audit grep must return zero hits)

| Module | Declared layer | Exports |
|--------|---------------|---------|
| `blockPredicates.ts` | pure | `bannerMessageFor`, `classifySource`, `splitOrInsert`, `classifyMarkdownPrefix`, `classifyBackspaceAtZero` |
| `debounceSchedule.ts` | pure | `IDLE_SAVE_DEBOUNCE_MS`, `nextFireAt`, `computeNextFireAt`, `shouldFireIdleSave` |

### Effectful Shell Modules (intentionally impure)

| Module | Declared reason |
|--------|----------------|
| `BlockElement.svelte` | `$state`/`$effect`/`$derived`, DOM event handlers, `document.activeElement`, `window.getSelection()`, `adapter.dispatchXxx()` IPC |
| `SlashMenu.svelte` | `$state`/`$effect`/`$derived`, `<svelte:window onkeydown>`, callback dispatch |
| `BlockDragHandle.svelte` | `$state`, HTML5 Drag-and-Drop API, `event.dataTransfer` |
| `SaveFailureBanner.svelte` | `$derived`, callback dispatch |
| `debounceTimer.ts` | `setTimeout`/`clearTimeout` |
| `timerModule.ts` | `setTimeout`/`clearTimeout` |
| `keyboardListener.ts` | `addEventListener('keydown', ...)` — reserved, unused |
| `clipboardAdapter.ts` | `navigator.clipboard.writeText(...)` — reserved, unused |
| `types.ts` | type-only (no runtime code) |

### Canonical purity-audit grep pattern (from verification-architecture.md §1)

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now\b|\bDate\(|new Date\b|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

---

## Observed Boundaries

### Pure module audit: `blockPredicates.ts`

**Purity-audit grep result** (non-comment lines only): ZERO HITS

Raw output file: `security-results/grep-purity-audit.txt`

The only grep hits in the raw file are in doc-comment lines (e.g., line 8: `* Pure core module: must never import @tauri-apps/api...`). After filtering lines that begin with `//`, `*`, or `/*` (single-file grep format: `lineNo: content`), zero non-comment violations remain.

**Import analysis**: `blockPredicates.ts` imports only `type { SaveError, BlockType }` from `./types.js`. `types.ts` is type-only and emits no runtime code. No forbidden API is transitively imported.

**Runtime behavior**: All five exported functions are pure:
- `bannerMessageFor(error)`: switch on discriminated union, returns string literal or null. No I/O.
- `classifySource(triggerKind)`: switch on 2-value union, returns literal string. No I/O.
- `splitOrInsert(offset, contentLength)`: single equality comparison, returns literal. No I/O.
- `classifyMarkdownPrefix(content)`: iterates a constant array, tests `startsWith`, returns plain object or null. No I/O.
- `classifyBackspaceAtZero(focusedIndex, blockCount)`: two if-conditions, returns literal. No I/O.

### Pure module audit: `debounceSchedule.ts`

**Purity-audit grep result** (non-comment lines only): ZERO HITS

The only grep hits are in doc-comment lines (lines 6, 15, 82). After comment filtering, zero non-comment violations remain.

**Runtime behavior**: All exports are pure:
- `IDLE_SAVE_DEBOUNCE_MS = 2000`: named constant, no computation.
- `nextFireAt(lastEditTimestamp, debounceMs)`: arithmetic addition. No I/O.
- `computeNextFireAt(params)`: arithmetic comparisons, returns plain object. No I/O. Does not call `Date.now()` — the caller passes `nowMs` explicitly, making the function fully testable without time mocking.
- `shouldFireIdleSave(editTimestamps, lastSaveTimestamp, debounceMs, nowMs)`: uses `Math.max(...editTimestamps)` which is a pure numeric reduction, not a forbidden API (`Math.max` is not in the purity-audit pattern). No I/O.

### `types.ts` — type-only confirmation

**Check**: Are there any non-`type`/`interface`/`export type` top-level statements?

`grep -En '^(export )?(const|let|var|function\b|class\b)' types.ts` returned NO OUTPUT.

Every top-level declaration is `export type`, `type`, or `export interface`. The three `Enforce`/`_Check*` exports are pure type aliases with no runtime value:
```typescript
type Enforce<T extends true> = T;
export type _AssertEditBlockContentShape = ... ? true : never;
export type _CheckEditShape = Enforce<_AssertEditBlockContentShape>;
```
TypeScript erases these to nothing in the compiled output — no runtime bytes are emitted. Confirmed by inspection of source (no `.js` compiled output is checked into the repo; the `.svelte-kit/` directory exists but does not contain transpiled `types.js`).

**Result**: `types.ts` is type-only. No runtime side effects.

### Effectful shell modules — impurity confirmed

| Module | Observed impurity | Assessment |
|--------|------------------|------------|
| `BlockElement.svelte` | `$state`, `$effect`, `$derived` (lines 55–57, 60–64, 286–288); `document.activeElement` (line 61, 99); `window.getSelection()` (line 67); `adapter.dispatchXxx().catch(...)` (multiple) | Intentional, correctly declared |
| `SlashMenu.svelte` | `$state` (line 39), `$effect` (lines 51–54), `$derived` (lines 41–48), `<svelte:window onkeydown>` (line 74) | Intentional, correctly declared |
| `BlockDragHandle.svelte` | `$state` (line 38), `event.dataTransfer.setData(...)` (line 44) | Intentional, correctly declared |
| `SaveFailureBanner.svelte` | `$derived` (line 29) | Intentional, correctly declared |
| `debounceTimer.ts` | `setTimeout` (line 35), `clearTimeout` (line 26) | Intentional, correctly declared |
| `timerModule.ts` | `setTimeout` (line 21), `clearTimeout` (line 32) | Intentional, correctly declared |
| `keyboardListener.ts` | `addEventListener('keydown', ...)` (line 24) | Intentional, reserved-unused — confirmed no importers (FIND-BE-3-012) |
| `clipboardAdapter.ts` | `navigator.clipboard.writeText(...)` (line 20) | Intentional, reserved-unused — confirmed no importers (FIND-BE-3-012) |

### `sanitiseContent` purity check

`sanitiseContent(raw: string, type: BlockType): string` in `BlockElement.svelte` (lines 122–143) is a local helper. Purity assessment:

- Input: two value-type arguments (`string`, `BlockType` literal)
- Output: `string`
- Body: a for-loop over `raw.charCodeAt(i)` accumulating into a local `out` string
- No DOM access (no `document.*`, no `element.*`)
- No global state read or write
- No `this` reference
- No closure over mutable state (all referenced variables are parameters or local `let out`)

`sanitiseContent` is a pure function. Its placement inside an `<script lang="ts">` Svelte component does not make it impure — it has no access to the component's reactive state (`slashMenuOpen`, `blockEl`, etc.) and the body does not reference them.

The function is correctly embedded in the Effectful Shell because the Svelte component as a whole is impure, but the function itself satisfies the pure-function contract and could be promoted to `blockPredicates.ts` in a future refactor if desired.

---

## Summary

| Module | Layer | Pure-API audit | Notes |
|--------|-------|---------------|-------|
| `blockPredicates.ts` | Pure Core | ZERO HITS (non-comment) | All 5 exports verified pure; `Math.max` in `shouldFireIdleSave` is numeric, not forbidden |
| `debounceSchedule.ts` | Pure Core | ZERO HITS (non-comment) | All 4 exports verified pure; `nowMs` is injected as parameter, no `Date.now()` call |
| `types.ts` | Type-only | Not applicable | No runtime code emitted; `Enforce<T>` assertions are compile-time only |
| `BlockElement.svelte` | Effectful Shell | Impure (correct) | `$state`/`$effect`, DOM API, IPC dispatch. `sanitiseContent` local helper is pure. |
| `SlashMenu.svelte` | Effectful Shell | Impure (correct) | `$state`/`$effect`/`$derived`, `<svelte:window>` |
| `BlockDragHandle.svelte` | Effectful Shell | Impure (correct) | `$state`, Drag-and-Drop API |
| `SaveFailureBanner.svelte` | Effectful Shell | Impure (correct) | `$derived` only; inner logic delegates to `bannerMessageFor` (pure) |
| `debounceTimer.ts` | Effectful Shell | Impure (correct) | `setTimeout`/`clearTimeout` |
| `timerModule.ts` | Effectful Shell | Impure (correct) | `setTimeout`/`clearTimeout` |
| `keyboardListener.ts` | Effectful Shell (reserved) | Impure (correct) | `addEventListener`; zero importers in production |
| `clipboardAdapter.ts` | Effectful Shell (reserved) | Impure (correct) | `navigator.clipboard`; zero importers in production |

**No drift detected** between `specs/verification-architecture.md §2` and the observed implementation. All pure modules are clean, all effectful modules are correctly classified, and the `types.ts` type-only contract holds.

**Required follow-up before Phase 6**: None. All boundaries are correct. Optional future item: promote `sanitiseContent` to `blockPredicates.ts` for easier Tier 2 property testing of the strip logic.
