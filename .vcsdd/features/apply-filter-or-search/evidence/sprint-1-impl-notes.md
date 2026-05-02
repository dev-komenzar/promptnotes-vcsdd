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

## Adversary iteration 1 finding fixes (post Phase 3, pre re-review)

### FIND-001: tryNewTag third error variant removed (2b fix)

Removed the `{ kind: "invalid-tag" }` variant from `tryNewTag`'s local error type and dropped the `/^[a-z0-9-]+$/` character-set guard. The function now returns only the canonical `TagError` variants (`empty`, `only-whitespace`) as declared in `docs/domain/code/ts/src/shared/value-objects.ts:43`. Character-set policy is deferred per behavioral-spec.md Open Question 4. `tryNewTag` is also no longer re-exported from `index.ts` — it is now an implementation-private detail consumed solely by `parseFilterInput`, which continues to rewrap any failure as `{ kind: "invalid-tag", raw }` per REQ-003.

### FIND-002: PROP-002 and PROP-007 extended to non-trivial AppliedFilter (2a fix)

Added two new tests to each of `prop-002-apply-determinism.harness.test.ts` and `prop-007-sort-determinism.harness.test.ts`. Each harness now includes a frequency-mixed arbitrary (`arbAppliedFilterMixed`) that combines `arbAppliedFilterNoOp` (weight 2), `arbAppliedFilterWithTags` (weight 3), and a search+sort variant (weight 2). The ∀ determinism claim is now witnessed over non-trivial filter, search, and sort cases (500 runs mixed + 200 runs tag-only). Total new tests: 4 (2 per harness).

### FIND-003: Performance harness converted to soft advisory pattern (2a fix)

Replaced hard `expect(median).toBeLessThan(50)` and `expect(median).toBeLessThan(5)` with a three-part pattern: `console.log` the measured median, `console.warn` if the advisory bound is exceeded, and a hard `expect` only against a 5× catastrophic bound (250ms / 25ms). This matches the "soft regression bound, advisory in CI" methodology in verification-architecture.md. A 60ms median no longer fails CI; a 1000ms median still does.

## Refactor changes (Phase 2c)

- `apply-filter-or-search.ts`: Extracted per-snapshot predicate functions (`matchesTagFilter`, `matchesFieldFilter`, `matchesSearchQuery`) instead of per-array filter functions. This eliminates the `as NoteFileSnapshot[]` casts on no-op returns and chains the filters naturally with `.filter()`. The `byUpdatedAtThenNoteId` comparator is unchanged.
- Removed unused `NoteId` import from `apply-filter-or-search.ts`; added `SearchQuery` import for the explicit predicate signature.
- Fixed misleading comment block in `try-new-tag.ts` to accurately describe the normalization order (trim → strip # → lowercase).
