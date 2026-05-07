# FIND-017: REQ-011 (Feed.refreshSort) has no proof obligation in coverage matrix

**Dimension**: traceability_completeness
**Severity**: minor

## Location
- `verification-architecture.md` Coverage Matrix line 181 (REQ-011 row), PROP-012 (line 131), PROP-013 (line 132)
- `behavioral-spec.md` REQ-011 (lines 250-261) Acceptance Criteria L257

## Evidence

REQ-011 (`behavioral-spec.md` L250-261) has THREE acceptance criteria:
1. "Feed sort order is refreshed to reflect the new `updatedAt`."
2. "TagInventory is updated with any tag additions or removals."
3. "IndexedNote is produced."

The Coverage Matrix (`verification-architecture.md` L181) maps REQ-011 to PROP-012 and PROP-013, but BOTH of those obligations only describe TagInventoryUpdated event emission semantics — they do NOT prove Feed sort refresh or IndexedNote production.

> PROP-012 (L131): "`TagInventoryUpdated` is emitted iff tag delta exists..."
> PROP-013 (L132): "`TagInventoryUpdated` NOT emitted when previousFrontmatter is null and new note has no tags"

Neither asserts anything about `Feed.refreshSort` being called, or about its effect on Feed ordering, or about `IndexedNote` shape. PROP-017 (full pipeline integration, REQ-001/REQ-009) might transitively cover Feed refresh, but its description does not commit to it.

## Recommended fix

Either:

(a) If FIND-015 is resolved by removing Step 4 from this spec, this finding becomes moot — REQ-011 is removed or moved out.

(b) If REQ-011 stays, add a new PROP (e.g., PROP-027) of Tier 2 (example-based test):
> "PROP-027: `updateProjections` invokes `Feed.refreshSort` exactly once per pipeline run when Step 3 succeeds. After invocation, the Feed's sort order reflects the saved note's new `updatedAt` (the note appears at the top under the default descending-timestamp sort)."

Add another PROP for IndexedNote production OR remove acceptance criterion #3 if IndexedNote is not a typed artifact (it is not defined in `stages.ts`).

Update Coverage Matrix REQ-011 row to include the new PROP IDs.
