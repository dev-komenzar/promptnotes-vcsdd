/**
 * deleteConfirmPredicates.ts — Pure predicates for delete confirm modal.
 *
 * Pure functions only. No side effects.
 * PROP-FEED-031: purity-audit grep must hit zero on this file.
 *
 * NoteDeletionFailureReason is 'permission' | 'lock' | 'unknown' (3 variants).
 * 'not-found' is excluded per REQ-DLN-005.
 * deletionErrorMessage is a total function: never throws.
 * Exhaustive switch obligation: PROP-FEED-012 (tsc --strict).
 */

import type { NoteDeletionFailureReason } from './types.js';

/**
 * REQ-FEED-014 / PROP-FEED-008 / PROP-FEED-009 / PROP-FEED-012
 * Returns the localized deletion error message for a given reason.
 * When reason === 'unknown' and detail is provided, appends detail in parens.
 * Never returns null; always returns a non-empty string.
 * Exhaustive switch over NoteDeletionFailureReason (3 variants).
 */
export function deletionErrorMessage(
  reason: NoteDeletionFailureReason,
  detail?: string
): string {
  switch (reason) {
    case 'permission':
      return '削除に失敗しました（権限不足）';
    case 'lock':
      return '削除に失敗しました（ファイルがロック中）';
    case 'unknown': {
      if (detail !== undefined && detail.length > 0) {
        return `削除に失敗しました（${detail}）`;
      }
      return '削除に失敗しました';
    }
    default: {
      // Exhaustive check: TypeScript will error if a new variant is added without handling it.
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/**
 * REQ-FEED-010 / PROP-FEED-010
 * Returns true iff the delete modal can be opened for rowNoteId.
 * Returns false when rowNoteId === editingNoteId (self-delete prevention).
 * canOpenDeleteModal(a, a) === false for all a: string.
 */
export function canOpenDeleteModal(rowNoteId: string, editingNoteId: string | null): boolean {
  if (editingNoteId === null) return true;
  return rowNoteId !== editingNoteId;
}
