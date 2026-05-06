/**
 * searchPredicate.ts — Pure search predicate (ui-filter-search)
 *
 * PROP-FILTER-001 compliance: no side effects, no forbidden APIs.
 * PROP-FILTER-010: uses String.prototype.toLowerCase() ONLY.
 *   toLocaleLowerCase() is PROHIBITED (REQ-FILTER-005).
 *
 * Case fold:
 *   - ASCII A-Z folded to a-z
 *   - Non-ASCII characters (CJK, Arabic, Turkish i, etc.) pass through unchanged
 *
 * Empty needle: always returns true (universal pass — PROP-FILTER-011).
 */

/**
 * Returns true iff `needle` is a case-insensitive substring of `haystack`.
 *
 * @param needle   - The lowercased search term. Empty string always returns true.
 * @param haystack - The text to search within (body + tags concatenated).
 *
 * REQ-FILTER-005: case-insensitive substring only; no regex or fuzzy matching.
 * The caller is responsible for constructing the haystack from note body + tags.
 */
export function searchPredicate(needle: string, haystack: string): boolean {
  if (needle === '') {
    return true;
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
