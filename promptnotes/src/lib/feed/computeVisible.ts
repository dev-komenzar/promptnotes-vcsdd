/**
 * computeVisible.ts — Pure composition function (ui-filter-search)
 *
 * PROP-FILTER-001 compliance: no side effects, no forbidden APIs.
 * PROP-FILTER-012: AND composition of tag filter (OR within tags) + search.
 *
 * This is the single source of truth for visibleNoteIds computation.
 * It is called by feedReducer for all action variants that affect visibility.
 *
 * REQ-FILTER-008: AND semantics between filter dimensions.
 * REQ-FILTER-009: sort applies after filter + search composition.
 */

import type { NoteRowMetadata } from './types.js';
import { searchPredicate } from './searchPredicate.js';
import { sortByUpdatedAt } from './sortByUpdatedAt.js';

/**
 * Computes the visible note IDs after applying tag filter, search filter, and sort.
 *
 * Step 1: tag filter (OR semantics — note passes if it has ANY active tag)
 * Step 2: search filter (AND — note passes if haystack contains needle)
 * Step 3: sort by updatedAt (tiebreak: noteId in same direction)
 *
 * @param allNoteIds    - Unfiltered domain ID list from last snapshot (allNoteIds)
 * @param noteMetadata  - Per-noteId metadata map
 * @param activeTags    - Currently active tag filter set (OR semantics)
 * @param searchQuery   - Current committed search query ('' = no search)
 * @param sortDir       - Sort direction ('desc' = newest first, 'asc' = oldest first)
 * @returns             - Filtered and sorted note ID array
 */
export function computeVisible(
  allNoteIds: readonly string[],
  noteMetadata: Readonly<Record<string, NoteRowMetadata>>,
  activeTags: readonly string[],
  searchQuery: string,
  sortDir: 'asc' | 'desc'
): readonly string[] {
  // Step 1: tag filter (OR semantics)
  const tagFiltered =
    activeTags.length > 0
      ? allNoteIds.filter((id) => {
          const tags = noteMetadata[id]?.tags ?? [];
          return tags.some((t) => activeTags.includes(t));
        })
      : allNoteIds;

  // Step 2: search filter (AND, case-insensitive substring)
  // Guard: searchQuery may be undefined if called from pre-extension state
  const needle = (searchQuery ?? '').toLowerCase();
  const searchFiltered =
    needle !== ''
      ? tagFiltered.filter((id) => {
          const m = noteMetadata[id];
          const haystack = (m?.body ?? '') + ' ' + (m?.tags ?? []).join(' ');
          return searchPredicate(needle, haystack);
        })
      : tagFiltered;

  // Step 3: sort by updatedAt (tiebreak: noteId in same direction)
  const cmp = sortByUpdatedAt(sortDir);
  const sorted = searchFiltered
    .map((id) => ({ noteId: id, updatedAt: noteMetadata[id]?.updatedAt ?? 0 }))
    .sort(cmp);

  return sorted.map((r) => r.noteId);
}
