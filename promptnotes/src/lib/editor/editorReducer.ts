/**
 * editorReducer.ts — pure mirror reducer for the block-based ui-editor (Sprint 7)
 *
 * Phase 2a stub: the reducer body throws 'not-implemented: phase-2a stub'.
 * This makes all tests that call editorReducer fail at runtime (Red phase).
 *
 * Pure core module: must never import @tauri-apps/api or any forbidden API.
 * Signatures match verification-architecture.md §2 exactly.
 *
 * Re-exports EditorAction, EditorCommand, EditorViewState for convenience.
 */

import type { EditorViewState, EditorAction, EditorCommand } from './types.js';

export type { EditorAction, EditorCommand, EditorViewState } from './types.js';

/** Return type of editorReducer. */
export type ReducerResult = {
  state: EditorViewState;
  commands: ReadonlyArray<EditorCommand>;
};

/**
 * PROP-EDIT-007, PROP-EDIT-008, PROP-EDIT-040
 * Mirror reducer: total over all (EditorAction.kind × EditingSessionStatus) pairs.
 * Returns { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }.
 * Never throws in production; here throws for Red phase.
 */
export function editorReducer(
  state: EditorViewState,
  action: EditorAction
): ReducerResult {
  void state;
  void action;
  throw new Error('not-implemented: phase-2a stub');
}
