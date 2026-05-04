/**
 * editorPredicates.ts — pure predicates for the ui-editor feature
 *
 * Pure core module: deterministic, no side effects, no forbidden APIs.
 * See verification-architecture.md §2 for the canonical purity-audit pattern.
 */

import type { EditingSessionStatus, FsError, SaveError } from './types.js';

/** Lookup table for all FsError variants → user-facing Japanese message. */
const FS_ERROR_MESSAGES: Record<FsError['kind'], string> = {
  permission: '保存に失敗しました（権限不足）',
  'disk-full': '保存に失敗しました（ディスク容量不足）',
  lock: '保存に失敗しました（ファイルがロックされています）',
  unknown: '保存に失敗しました',
};

/**
 * REQ-EDIT-003
 * Returns true iff body.trim().length === 0 per ECMAScript String.prototype.trim.
 */
export function isEmptyAfterTrim(bodyStr: string): boolean {
  return bodyStr.trim().length === 0;
}

/**
 * REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006
 * Returns true iff the Copy button should be enabled.
 * - false for status ∈ {'idle', 'switching', 'save-failed'} regardless of body.
 * - !isEmptyAfterTrim(bodyStr) for status ∈ {'editing', 'saving'}.
 */
export function canCopy(bodyStr: string, status: EditingSessionStatus): boolean {
  switch (status) {
    case 'idle':
    case 'switching':
    case 'save-failed':
      return false;
    case 'editing':
    case 'saving':
      return !isEmptyAfterTrim(bodyStr);
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return false;
    }
  }
}

/**
 * REQ-EDIT-015, REQ-EDIT-016
 * Returns the user-facing Japanese message for fs errors; null for validation errors.
 * Exhaustive switch enforced at compile time (Tier 0 obligation).
 */
export function bannerMessageFor(error: SaveError): string | null {
  switch (error.kind) {
    case 'fs':
      // FS_ERROR_MESSAGES covers all FsError variants; Record key type enforces exhaustiveness.
      return FS_ERROR_MESSAGES[error.reason.kind];
    case 'validation':
      // Silent: invariant-violated and empty-body-on-idle are never shown as banner.
      return null;
    default: {
      const _exhaustive: never = error;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * REQ-EDIT-026, RD-013
 * Pure mapping from trigger event kind to domain SaveSource enum value.
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
