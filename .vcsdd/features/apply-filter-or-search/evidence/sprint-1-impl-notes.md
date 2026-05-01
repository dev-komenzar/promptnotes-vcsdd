# Sprint 1 Implementation Notes

## Issues encountered

### fast-check v4 API incompatibility in `_arbitraries.ts`

**Symptom**: Tests using `arbInvalidTagString()` and direct `fc.stringOf()` calls in PROP-010, PROP-011b, PROP-017 failed with `TypeError: fc.stringOf is not a function`.

**Root cause**: `_arbitraries.ts` (shared test helper) was authored against fast-check v3 API which had `fc.stringOf(arbitrary, options)`. fast-check v4 removed this function.

**Resolution**: Downgraded `fast-check` in `package.json` from `^4.7.0` to `^3.23.2`. All tests now pass. No test files were modified.

### PROP-011a static source path resolution

**Symptom**: The PROP-011a harness computed the implementation file path via `path.resolve(import.meta.dir, "../../../../../../../lib/domain/apply-filter-or-search/parse-filter-input.ts")`, which resolves to `<repo-root>/lib/domain/apply-filter-or-search/parse-filter-input.ts` (7 levels up from `__verify__/`), not inside `promptnotes/src/lib/`.

**Resolution**: Created a symlink at `<repo-root>/lib` → `promptnotes/src/lib/`. The static file exists at the expected path via symlink, and the import pattern regex `/import[^;]*tryNewTag[^;]*from[^;]*try-new-tag/` matches the actual import in `parse-filter-input.ts`.

### `tryNewTag` normalization order

**Fix applied**: Initial implementation stripped `#` before trimming, so `"  #Claude-Code  "` → withoutHash was `"  #Claude-Code  "` (no `#` at start) → lowercase → `"  #claude-code  "` → trim → `"#claude-code"` → rejected as invalid. Correct order is: trim first, then strip `#`, then lowercase.

## Refactor changes (Phase 2c)

- `apply-filter-or-search.ts`: Extracted per-snapshot predicate functions (`matchesTagFilter`, `matchesFieldFilter`, `matchesSearchQuery`) instead of per-array filter functions. This eliminates the `as NoteFileSnapshot[]` casts on no-op returns and chains the filters naturally with `.filter()`. The `byUpdatedAtThenNoteId` comparator is unchanged.
- Removed unused `NoteId` import from `apply-filter-or-search.ts`; added `SearchQuery` import for the explicit predicate signature.
- Fixed misleading comment block in `try-new-tag.ts` to accurately describe the normalization order (trim → strip # → lowercase).
