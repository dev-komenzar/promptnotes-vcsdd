# Purity Boundary Audit

## Feature: ui-editor | Sprint: 7 | Date: 2026-05-06

## Declared Boundaries

From `specs/verification-architecture.md §2`:

Pure core modules (zero I/O, zero side effects, no forbidden APIs):
- `editorPredicates.ts` — canCopy, bannerMessageFor, classifySource, splitOrInsert, classifyMarkdownPrefix, classifyBackspaceAtZero
- `editorReducer.ts` — editorReducer(state, action): { state, commands }
- `debounceSchedule.ts` — computeNextFireAt, shouldFireIdleSave, nextFireAt

Effectful shell modules (permitted to use all APIs):
- `EditorPanel.svelte`, `BlockElement.svelte`, `SaveFailureBanner.svelte`, `SlashMenu.svelte`, `BlockDragHandle.svelte`
- `tauriEditorAdapter.ts` (OUTBOUND — invoke only)
- `editorStateChannel.ts` (INBOUND — listen only)
- `timerModule.ts`, `keyboardListener.ts`, `clipboardAdapter.ts`, `debounceTimer.ts`

## Observed Boundaries

### editorPredicates.ts

Purity grep scan (canonical pattern from verification-architecture.md §2):
```
grep -nE "Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api" editorPredicates.ts
```

Matches found: 1 (line 6, inside JSDoc comment block `/** Pure core module: must never import @tauri-apps/api... */`)

Executable-code matches: 0

Imports: `import type { EditorViewState, SaveError, BlockType } from './types.js'` — type-only import, no runtime dependency on effectful modules.

Verdict: PURE — conforms to declared boundary.

### editorReducer.ts

Purity grep scan:
Matches found: 1 (line 6, inside JSDoc comment block)
Executable-code matches: 0

Imports: `import type { EditorViewState, EditorAction, EditorCommand, EditingSessionStateDto, DtoBlock } from './types.js'` — type-only.

Verdict: PURE — conforms to declared boundary.

### debounceSchedule.ts

Purity grep scan:
Matches found: 3 (lines 6, 15, 82 — all inside JSDoc/inline comments)
Executable-code matches: 0

Imports: none (standalone module).

Notable: `IDLE_SAVE_DEBOUNCE_MS = 2000` is a named constant export. The actual `setTimeout` call lives in `timerModule.ts` (impure shell), not here.

Verdict: PURE — conforms to declared boundary.

### Shell modules (spot-check)

- `tauriEditorAdapter.ts`: contains `invoke(` calls (expected OUTBOUND), no `listen(` calls. CONFORMS.
- `editorStateChannel.ts`: contains `listen(` call (expected INBOUND), no `invoke(` calls. CONFORMS.
- `EditorPanel.svelte`: uses `$state`, `$derived`, `$effect` (expected impure). CONFORMS.
- `timerModule.ts`: uses `setTimeout`/`clearTimeout` (expected impure). CONFORMS.

## Summary

No purity drift detected.

All three pure-core modules (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) contain zero executable forbidden-API calls. The effectful/pure boundary observed in the implementation matches the boundary declared in `verification-architecture.md §2` exactly.

The only grep matches in pure modules are inside JSDoc comment blocks — they are documentation of the boundary constraint, not violations of it.

No follow-up required before Phase 6.
