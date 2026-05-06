/**
 * editorPredicates.ts — pure predicates for the block-based ui-editor (Sprint 7)
 *
 * Phase 2b implementation: all stubs replaced with real logic.
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
  switch (view.status) {
    case 'idle':
    case 'switching':
    case 'save-failed':
      return false;
    case 'editing':
    case 'saving':
      return !view.isNoteEmpty;
    default: {
      const _exhaustive: never = view.status;
      void _exhaustive;
      return false;
    }
  }
}

/**
 * REQ-EDIT-025, REQ-EDIT-026, PROP-EDIT-005, PROP-EDIT-042
 * Returns user-facing Japanese message for fs errors; null for validation errors.
 * Exhaustive switch enforced at compile time.
 */
export function bannerMessageFor(error: SaveError): string | null {
  switch (error.kind) {
    case 'fs': {
      switch (error.reason.kind) {
        case 'permission':
          return '保存に失敗しました（権限不足）';
        case 'disk-full':
          return '保存に失敗しました（ディスク容量不足）';
        case 'lock':
          return '保存に失敗しました（ファイルがロックされています）';
        case 'not-found':
          return '保存に失敗しました（保存先が見つかりません）';
        case 'unknown':
          return '保存に失敗しました';
        default: {
          const _exhaustive: never = error.reason;
          void _exhaustive;
          return '保存に失敗しました';
        }
      }
    }
    case 'validation':
      return null;
    default: {
      const _exhaustive: never = error;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * REQ-EDIT-037, PROP-EDIT-002
 * Pure mapping from trigger kind to domain save source.
 * 'idle' → 'capture-idle'; 'blur' → 'capture-blur'.
 */
export function classifySource(triggerKind: 'idle' | 'blur'): 'capture-idle' | 'capture-blur' {
  switch (triggerKind) {
    case 'idle':
      return 'capture-idle';
    case 'blur':
      return 'capture-blur';
    default: {
      const _exhaustive: never = triggerKind;
      void _exhaustive;
      return 'capture-idle';
    }
  }
}

/**
 * REQ-EDIT-006, REQ-EDIT-007, PROP-EDIT-001, EC-EDIT-012
 * Returns 'insert' iff offset === contentLength (Enter at end of block);
 * returns 'split' for any offset strictly inside the block.
 */
export function splitOrInsert(offset: number, contentLength: number): 'split' | 'insert' {
  return offset === contentLength ? 'insert' : 'split';
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
  // Exact match for divider — must be exactly '---', no more no less.
  if (content === '---') {
    return { newType: 'divider', trimmedContent: '' };
  }

  // Ordered from most specific to least specific to avoid prefix clashes.
  const prefixes: Array<[string, BlockType]> = [
    ['### ', 'heading-3'],
    ['## ', 'heading-2'],
    ['# ', 'heading-1'],
    ['- ', 'bullet'],
    ['* ', 'bullet'],
    ['1. ', 'numbered'],
    ['```', 'code'],
    ['> ', 'quote'],
  ];

  for (const [prefix, newType] of prefixes) {
    if (content.startsWith(prefix)) {
      const trimmedContent = content.slice(prefix.length);
      return { newType, trimmedContent };
    }
  }

  return null;
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
  if (focusedIndex === 0) {
    return 'first-block-noop';
  }
  if (focusedIndex > 0 && focusedIndex < blockCount) {
    return 'merge';
  }
  return 'normal-edit';
}
