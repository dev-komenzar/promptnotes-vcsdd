/**
 * PROP-027 Proof Harness — HydrateNote ACL purity
 *
 * Tier: 1 (fast-check property test)
 * Required: true
 * Sprint: 5 iteration 2
 * Date: 2026-05-08T00:00:00Z
 *
 * Test source:
 *   promptnotes/src/lib/domain/__tests__/app-startup/hydrate-note-purity.test.ts
 *
 * Property:
 *   ∀ snapshot ∈ NoteFileSnapshot, hydrateNote(snapshot) deepEquals hydrateNote(snapshot)
 *   including Note.blocks (same BlockId values, no filtering, no re-numbering).
 *   Failure-mode determinism:
 *     - Err(BlockParseError) body → always Err('block-parse')
 *     - Ok([]) body → always Err('block-parse')
 *   Unary function (arity = 1), no I/O, no clock, no Date.now().
 *
 * Evidence:
 *   - 13 tests pass:
 *     - 5 purity / referential-transparency tests (concrete + fast-check property)
 *     - 3 failure-mode determinism tests
 *     - 3 rev8 pass-through tests (no filter, no BlockId reassignment)
 *     - 2 REQ-008 composite tests
 *   - fast-check numRuns default (100)
 *   - See fuzz-results/sprint-5/prop-027.log
 *
 * Result: PROVED — 13 pass / 0 fail
 */

// Canonical test file:
//   promptnotes/src/lib/domain/__tests__/app-startup/hydrate-note-purity.test.ts
//
// Key test names (mapping to spec claims):
//   "PROP-027 — simple paragraph body: same snapshot → same Ok(Note) result both times"
//   "PROP-027 — multi-block body: Block[] is identical on both calls (including BlockId values)"
//   "PROP-027 property (fast-check): ∀ snapshot, hydrateNote(snapshot) deepEquals hydrateNote(snapshot)"
//   "PROP-027 — hydrateNote takes only NoteFileSnapshot: arity is 1"
//   "PROP-027 — hydrateNote produces Note with noteId matching snapshot.noteId"
//   "PROP-027 — unterminated code fence body → always Err('block-parse'), both calls"
//   "PROP-027 — Ok([]) body → always Err('block-parse') (downstream invariant: blocks.length >= 1)"
//   "PROP-027 — no I/O: Date.now not called during hydrateNote"
//   "REQ-002 rev8 — hydrateNote with stub returning [paragraph(''), heading('X'), paragraph('')] passes ALL 3 blocks through"
//   "REQ-002 rev8 — hydrateNote with stub returning [paragraph('')] passes through the 1 block (NOT Err)"
//   "REQ-002 rev8 — hydrateNote with stub returning non-empty blocks does NOT reassign BlockIds"
//   "PROP-027 — two hydrateNote calls with same snapshot produce same Note (enables hydrateFeed purity)"
//   "PROP-027 — hydrateNote does NOT call FrontmatterParser.parse (frontmatter is already VO on snapshot)"
