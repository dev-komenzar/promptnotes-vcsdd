/**
 * editorPredicates.ts — pure predicates for the block-based ui-editor (Sprint 7)
 *
 * Phase 2a stub: every function body throws 'not-implemented: phase-2a stub'.
 * This makes all tests that call these functions fail at runtime (Red phase).
 *
 * Pure core module: must never import @tauri-apps/api or any forbidden API.
 * Signatures match verification-architecture.md §2 exactly.
 */

import type { EditorViewState, SaveError, BlockType } from './types.js';

/**
 * REQ-EDIT-005, REQ-EDIT-032, PROP-EDIT-006
 * Returns true iff the Copy button should be enabled.
 * - false for status ∈ {'idle', 'switching', 'save-failed'} regardless of isNoteEmpty.
 * - !view.isNoteEmpty for status ∈ {'editing', 'saving'}.
 */
export function canCopy(view: EditorViewState): boolean {
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * REQ-EDIT-025, REQ-EDIT-026, PROP-EDIT-005, PROP-EDIT-042
 * Returns user-facing Japanese message for fs errors; null for validation errors.
 * Exhaustive switch enforced at compile time.
 */
export function bannerMessageFor(error: SaveError): string | null {
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * REQ-EDIT-037, PROP-EDIT-002
 * Pure mapping from trigger kind to domain save source.
 * 'idle' → 'capture-idle'; 'blur' → 'capture-blur'.
 */
export function classifySource(triggerKind: 'idle' | 'blur'): 'capture-idle' | 'capture-blur' {
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * REQ-EDIT-006, REQ-EDIT-007, PROP-EDIT-001, EC-EDIT-012
 * Returns 'insert' iff offset === contentLength (Enter at end of block);
 * returns 'split' for any offset strictly inside the block.
 */
export function splitOrInsert(offset: number, contentLength: number): 'split' | 'insert' {
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * REQ-EDIT-010, PROP-EDIT-010, EC-EDIT-013
 * Returns { newType, trimmedContent } for recognised Markdown prefix; null otherwise.
 * Divider rule: returns { newType: 'divider', trimmedContent: '' } iff content === '---' exactly.
 * Any other string beginning with '---' returns null.
 */
export function classifyMarkdownPrefix(
  content: string
): { newType: BlockType; trimmedContent: string } | null {
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * REQ-EDIT-008, PROP-EDIT-011, EC-EDIT-011
 * Returns:
 * - 'first-block-noop'  iff focusedIndex === 0
 * - 'merge'             iff 0 < focusedIndex < blockCount
 * - 'remove-empty-noop' (reserved for empty-last-block edge case)
 * - 'normal-edit'       (reserved for non-zero offset fallback)
 */
export function classifyBackspaceAtZero(
  focusedIndex: number,
  blockCount: number
): 'merge' | 'remove-empty-noop' | 'first-block-noop' | 'normal-edit' {
  throw new Error('not-implemented: phase-2a stub');
}
