/**
 * clockHelpers.ts — Effectful clock helpers for the feed shell.
 *
 * Effectful shell only. Not part of the pure core.
 * PROP-FEED-031 audit does NOT scan this file.
 *
 * Provides a single canonical call site for ISO timestamp generation
 * used by FeedRow, DeleteConfirmModal, and DeletionFailureBanner.
 */

/**
 * Returns the current instant as an ISO-8601 string.
 * Centralises `new Date().toISOString()` scatter across feed shell components.
 * Must NOT be imported by pure core modules (feedReducer, feedRowPredicates, deleteConfirmPredicates).
 */
export function nowIso(): string {
  return new Date().toISOString();
}
