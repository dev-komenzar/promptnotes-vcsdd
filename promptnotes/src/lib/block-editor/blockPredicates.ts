/**
 * blockPredicates.ts — pure predicates for ui-block-editor primitives
 *
 * 旧 ui-editor (EditorPane) feature の `editorPredicates.ts` を継承。
 * EditorPane を廃止したため `canCopy(view: EditorViewState)` は除去した
 * （Copy ボタンの可視性判定は FeedRow 側のロジックへ移管予定）。
 *
 * Pure core module: must never import @tauri-apps/api or any forbidden API.
 * Signatures aligned with verification-architecture.md (旧 ui-editor §2) for
 * 移行期の互換性。
 */

import type { SaveError, BlockType } from './types.js';

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
  if (content === '---') {
    return { newType: 'divider', trimmedContent: '' };
  }

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
