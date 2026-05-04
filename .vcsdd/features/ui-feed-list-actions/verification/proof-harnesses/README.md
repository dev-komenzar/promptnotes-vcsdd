# Proof Harnesses: ui-feed-list-actions

## Overview

All Tier 2 property tests (PROP-FEED-001 through PROP-FEED-035) are implemented as
`fast-check` property assertions within the bun:test suite. No separate harness files
are required. This README documents the mapping from PROP-FEED-NNN logical IDs to
their test locations.

## Tier 2 Harness Locations

| Logical ID | Schema ID | Test File | Description |
|------------|-----------|-----------|-------------|
| PROP-FEED-001 | PROP-001 | `promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts:169` | isEditingNote null safety, 200 runs |
| PROP-FEED-002 | PROP-002 | `promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts:216` | isDeleteButtonDisabled safety, 200 runs |
| PROP-FEED-003 | PROP-003 | `promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts:105` | bodyPreviewLines length, 200 runs |
| PROP-FEED-004 | PROP-004 | `promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts:138` | bodyPreviewLines content, 200 runs |
| PROP-FEED-005 | PROP-005 | `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts` | feedReducer totality, fast-check |
| PROP-FEED-006 | PROP-006 | `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts` | feedReducer purity, fast-check |
| PROP-FEED-007a | PROP-007 | `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts` | editing fields mirror |
| PROP-FEED-007b | PROP-008 | `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts` | visibleNoteIds mirror |
| PROP-FEED-007c | PROP-009 | `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts` | loadingStatus mirror |
| PROP-FEED-007d | PROP-010 | `promptnotes/src/lib/feed/__tests__/feedReducer.test.ts` | delete modal + error reset |
| PROP-FEED-008 | PROP-011 | `promptnotes/src/lib/feed/__tests__/deleteConfirmPredicates.test.ts` | deletionErrorMessage totality |
| PROP-FEED-009 | PROP-012 | `promptnotes/src/lib/feed/__tests__/deleteConfirmPredicates.test.ts` | non-empty + detail |
| PROP-FEED-010 | PROP-013 | `promptnotes/src/lib/feed/__tests__/deleteConfirmPredicates.test.ts` | canOpenDeleteModal self-delete |
| PROP-FEED-033 | PROP-036 | `promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts:60` | timestampLabel determinism, 200 runs |
| PROP-FEED-034 | PROP-037 | `promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts:267` | tag iteration preservation, 200 runs |
| PROP-FEED-035 | PROP-038 | `promptnotes/src/lib/feed/__tests__/refreshFeedEmission.test.ts:199` | refresh-feed biconditional, 500 runs |

## Coverage note (same toolchain split as ui-editor Phase 5)

The vitest coverage config (`vitest.config.ts`) includes only `dom/**/*.vitest.ts` files.
Pure unit and property tests run under `bun test` which reports line coverage only
(no branch coverage). The combined picture is:

| Module | Metric | Tool | Value |
|--------|--------|------|-------|
| `feedRowPredicates.ts` | line coverage | `bun test --coverage` | 100% |
| `feedReducer.ts` | line coverage | `bun test --coverage` | 94% (never-branch dead code) |
| `deleteConfirmPredicates.ts` | line coverage | `bun test --coverage` | 81.82% (never-branch dead code) |
| Branch coverage (DOM-only vitest path) | branch | `vitest --coverage` | UNDERCOUNTS — DOM tests do not invoke pure functions directly |

The uncovered lines in `feedReducer.ts` (lines 131-135) and `deleteConfirmPredicates.ts`
(lines 37-40) are TypeScript exhaustive-switch `never` guards — dead code by design,
unreachable at runtime. Same pattern as `editorPredicates.ts` in ui-editor Phase 5.
