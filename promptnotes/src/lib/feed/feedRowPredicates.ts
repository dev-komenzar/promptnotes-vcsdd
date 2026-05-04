/**
 * feedRowPredicates.ts — Pure core predicates for FeedRow rendering.
 *
 * Pure functions only. No side effects, no DOM access, no timers.
 * PROP-FEED-031: purity-audit grep must hit zero on this file.
 * PROP-FEED-033: timestampLabel uses Intl.DateTimeFormat(locale).format(epochMs).
 */

import type { FeedViewState } from './types.js';

/**
 * REQ-FEED-010 / PROP-FEED-001
 * Returns true iff rowNoteId is the currently-editing note.
 * Null-safe: editingNoteId === null always yields false.
 */
export function isEditingNote(rowNoteId: string, editingNoteId: string | null): boolean {
  if (editingNoteId === null) return false;
  return rowNoteId === editingNoteId;
}

/**
 * REQ-FEED-010 / PROP-FEED-002
 * Returns true iff the delete button for this row should be disabled.
 * Disabled when: status ∈ {'editing','saving','switching','save-failed'} AND
 * rowNoteId === editingNoteId.
 * editingNoteId === null or status === 'idle' always returns false.
 */
export function isDeleteButtonDisabled(
  rowNoteId: string,
  status: FeedViewState['editingStatus'],
  editingNoteId: string | null
): boolean {
  if (editingNoteId === null) return false;
  if (status === 'idle') return false;
  return rowNoteId === editingNoteId;
}

/**
 * REQ-FEED-002 / PROP-FEED-003 / PROP-FEED-004
 * Returns the first maxLines lines of body (split on '\n').
 * Result length is always ≤ maxLines.
 */
export function bodyPreviewLines(body: string, maxLines: number): readonly string[] {
  return body.split('\n').slice(0, maxLines);
}

/**
 * REQ-FEED-001 / PROP-FEED-033
 * Returns a human-readable timestamp string for the given epoch ms value.
 * Uses Intl.DateTimeFormat(locale).format(epochMs) — no clock access.
 * Pure and deterministic: same (epochMs, locale) always produces same output.
 */
export function timestampLabel(epochMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(epochMs);
}
