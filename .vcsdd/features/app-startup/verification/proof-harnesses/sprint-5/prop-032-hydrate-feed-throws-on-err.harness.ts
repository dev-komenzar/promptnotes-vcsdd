/**
 * PROP-032 Proof Harness — hydrateFeed throws on hydrateNote Err
 *
 * Tier: 2 (example-based test with divergent stub)
 * Required: true
 * Sprint: 5 iteration 2
 * Date: 2026-05-08T00:00:00Z
 *
 * Test source:
 *   promptnotes/src/lib/domain/__tests__/app-startup/step3-hydrate-feed.test.ts
 *   describe "PROP-032 / REQ-008 rev8 — hydrateFeed throws Error when hydrateNote returns Err for any snapshot"
 *
 * Property:
 *   If hydrateNote(snapshot) returns Err(HydrationFailureReason) during Step 3,
 *   hydrateFeed MUST throw Error whose .message matches /^hydrateNote-invariant-violation: .+: .+$/.
 *   The thrown Error MUST propagate out of hydrateFeed.
 *   corruptedFiles[] MUST NOT contain Step-3 entries.
 *
 * Evidence:
 *   - 5 tests pass:
 *     - throws Error with matching regex when hydrateNote returns Err (divergent parser stub)
 *     - thrown message contains snapshot.filePath and reason
 *     - corruptedFiles[] does NOT gain new entries from Step-3 Err (throw aborts)
 *     - does NOT throw when all hydrateNote calls return Ok (happy path negative test)
 *     - throws even when 1 of N snapshots diverges (any Err triggers throw)
 *   - See fuzz-results/sprint-5/prop-032.log
 *
 * Result: PROVED — 5 pass / 0 fail (within 22 tests for step3-hydrate-feed.test.ts)
 */

// Canonical test file:
//   promptnotes/src/lib/domain/__tests__/app-startup/step3-hydrate-feed.test.ts
//
// Key test names:
//   "PROP-032 — throws Error when hydrateNote returns Err for any snapshot (divergent parser stub)"
//   "PROP-032 — thrown Error message contains snapshot.filePath and reason"
//   "PROP-032 — corruptedFiles[] does NOT gain new entries from Step-3 divergent-stub Err (throw aborts)"
//   "PROP-032 — does NOT throw when all hydrateNote calls return Ok (happy path)"
//   "PROP-032 — throws even when 1 snapshot succeeds and 1 diverges (any Err triggers throw)"
