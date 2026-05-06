/**
 * sortByUpdatedAt.ts — Pure curried comparator factory (ui-filter-search)
 *
 * PROP-FILTER-001 compliance: no side effects, no forbidden APIs.
 * PROP-FILTER-014: deterministic; tiebreak by noteId lexicographic in same direction.
 *
 * REQ-FILTER-009: primary sort key is updatedAt (epoch ms); tiebreak is noteId.
 *
 * The factory receives a direction and returns a comparator that operates on
 * minimal objects { noteId, updatedAt }. The noteMetadata map is NOT a parameter;
 * the call-site in computeVisible projects note IDs to these objects before sorting.
 */

export type SortEntry = {
  readonly noteId: string;
  readonly updatedAt: number;
};

/**
 * Returns a comparator for sorting SortEntry[] by updatedAt (primary key)
 * and noteId (tiebreak), both in the given direction.
 *
 * @param direction - 'desc' = newest first; 'asc' = oldest first
 */
export function sortByUpdatedAt(
  direction: 'asc' | 'desc'
): (a: SortEntry, b: SortEntry) => number {
  return (a: SortEntry, b: SortEntry): number => {
    const timeDiff = a.updatedAt - b.updatedAt;
    if (timeDiff !== 0) {
      return direction === 'desc' ? -timeDiff : timeDiff;
    }
    // Tiebreak: noteId lexicographic in the same direction
    if (a.noteId < b.noteId) return direction === 'desc' ? 1 : -1;
    if (a.noteId > b.noteId) return direction === 'desc' ? -1 : 1;
    return 0;
  };
}
