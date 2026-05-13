## Declared Boundaries

Per `specs/verification-architecture.md`:

| Layer | Function | Purity |
|-------|----------|--------|
| Pure Core | `validate_no_control_chars` | Pure — string predicate, no side effects |
| Pure Core | `feedReducer` | Pure — state transition, no side effects |
| Effectful Shell | `mountCodeMirrorForNote` | Impure — DOM manipulation, EditorView lifecycle |
| Effectful Shell | `unmountCodeMirrorForNote` | Impure — DOM manipulation, EditorView destruction |
| Effectful Shell | `enterEditMode` / `exitEditMode` | Impure — module-level state mutation |
| Effectful Shell | `getEditingNoteId` / `getCurrentEditorBody` | Impure — reads module-level state |
| Effectful Shell | `FeedRow.svelte` handlers | Impure — IPC calls, timer management |
| Effectful Shell | `FeedList.svelte` dispatch | Impure — IPC dispatch |

## Observed Boundaries

- `feedRowEditMode.ts`: Mixed purity — `validate_no_control_chars` is pure, but shares module-level mutable state with impure mount/unmount functions. The pure function does NOT access module state.
- `feedReducer.ts`: Pure as declared. No side effects. `FeedRowEditorExited` action added — pure state transition.
- `FeedRow.svelte`: Effectful shell as declared. `invoke()` calls, `setTimeout`/`clearTimeout` timers, `$effect` DOM lifecycle.
- `FeedList.svelte`: Effectful shell as declared. IPC dispatch through adapter.

## Residual Risks

1. `feedRowEditMode.ts` mixes pure and impure exports in the same module. The pure function `validate_no_control_chars` shares a file with impure CodeMirror lifecycle functions. This is acceptable for a small module but could be separated in future refactoring.
2. Module-level state (`currentEditingNoteId`, `currentEditorView`) is global singleton. Multiple FeedRow instances share the same state via Svelte's reactivity bridge (`subscribeToEditState`). This works correctly through the Svelte $effect mechanism.
3. `invoke()` calls in FeedRow.svelte bypass the `feedReducer → adapter → command` pattern. These are direct IPC calls (editor_update_note_body, trigger_blur_save, trigger_idle_save) that don't affect the reducer state. The reducer handles only FeedViewState transitions.

## Summary

Purity boundaries are maintained. The pure core (`validate_no_control_chars`, `feedReducer`) remains free of side effects. The effectful shell (`FeedRow.svelte`, `feedRowEditMode.ts`) correctly handles all impure operations (DOM, IPC, timers). No purity violations detected.
