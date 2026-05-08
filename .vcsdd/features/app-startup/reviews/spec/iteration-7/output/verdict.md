# Phase 1c Spec Review — Verdict (iteration-7, lean mode)

**Feature**: `app-startup`
**Reviewed artefacts**: `behavioral-spec.md` rev 8, `verification-architecture.md` rev 8
**Reviewer**: vcsdd-adversary (fresh context, zero Builder history)
**Mode**: lean (binary PASS/FAIL on adversary verdict only)
**Timestamp**: 2026-05-08
**Iteration**: 7
**Delta scope**: REQ-002 / REQ-008 / REQ-017 AC sharpening + PROP-031 / PROP-032 added (Q5=A, Q6=A; resolves sprint-5 FIND-030, FIND-031)

## Per-dimension verdict

| Dimension | Verdict |
|-----------|---------|
| 1. EARS rigor | **PASS** |
| 2. Edge case coverage | **PASS** |
| 3. Purity boundary correctness | **PASS** |
| 4. Type-contract consistency | **PASS** |
| 5. Traceability | **PASS** |
| 6. Spec ambiguity / hallucination | **PASS** |

## Overall verdict

**PASS**

The rev8 delta is small and surgical. Each of the six rev8-targeted checkpoints holds:

1. **REQ-008 AC throw contract is concrete** (`behavioral-spec.md:201-202`):
   - Exact message format: `Error('hydrateNote-invariant-violation: <snapshot.filePath>: <reason>')`.
   - Propagation requirement: "MUST propagate out of `hydrateFeed` (NOT routed to `corruptedFiles`, NOT swallowed)".
   - corruptedFiles invariant: line 202 explicitly forbids Step-3 entries.
   The earlier vague "programming-error invariant violation" wording from rev7 (advisory FIND-029) is gone; no AC in rev8 still uses it.

2. **REQ-017 AC parser blank-line behavior is concrete** (`behavioral-spec.md:372`):
   - "MUST coalesce consecutive blank lines (`\n\n+` separators) into block boundaries WITHOUT emitting `paragraph('')` artifacts".
   - "A whitespace-only body (containing only `\n`, `\t`, ` ` characters) MUST yield `Ok([])`".
   - REQ-002 AC line 109 follows through: "the parser SHALL NOT emit `paragraph('')` blocks for blank-line `\n\n` separators".
   The rejected alternative — filtering inside `hydrateNote` — is now explicitly enumerated and rejected at REQ-017 line 374.

3. **Verification-architecture port-contract docstring matches** (`verification-architecture.md:88-105`):
   - Documents both (a) blank-line `\n\n+` separators do not produce `paragraph('')` artifacts and (b) whitespace-only body returns `Ok([])`. References "rev8, FIND-031" inline. Consistent with `behavioral-spec.md` REQ-017.

4. **PROP-031 is testable** (`verification-architecture.md:197`):
   - Concrete inputs given: `'a\n\n\nb'`, `'\n\n\n'`, `'   '`.
   - Concrete property: "no paragraph('') in any output". Tier 2, `required: true`.

5. **PROP-032 is testable** (`verification-architecture.md:198`):
   - Concrete regex on the thrown Error message: `/^hydrateNote-invariant-violation: .+: .+$/`.
   - Concrete stub harness: divergent `hydrateNote` returns `Err('block-parse')` for one snapshot; assert `hydrateFeed` throws and message matches.
   - The "corruptedFiles[] MUST NOT contain Step-3 entries" invariant is restated in the PROP. Tier 2, `required: true`.

6. **Q5=A consequences propagated to PROP-027 / PROP-029**:
   - PROP-027 (`verification-architecture.md:193`): "By Q2 determinism + Q5=A (no filter inside hydrateNote), the resulting `Note.blocks` is bit-identical to `parseMarkdownToBlocks(snapshot.body).value`, including BlockId values. `hydrateNote` does NOT filter, transform, or re-number blocks; it composes parser output with snapshot frontmatter only."
   - PROP-029 (`verification-architecture.md:195`): "Per Q5=A (rev8), `Ok([])` from `parseMarkdownToBlocks` corresponds to whitespace-only body input (no content blocks); the parser does NOT emit `paragraph('')` artifacts for blank-line separators."

7. **Counts match expected**:
   - Total PROPs = 32 (PROP-001..PROP-032), confirmed by the Coverage Matrix footer at `verification-architecture.md:250` ("Total proof obligations: 32 (PROP-001 through PROP-032)").
   - `required: true` count = 11, enumerated at line 250: PROP-001, PROP-002, PROP-003, PROP-004, PROP-023, PROP-025, PROP-026, PROP-027, PROP-029, PROP-031, PROP-032. Manual recount of the obligations table confirms each carries `required: **true**`.

8. **Coverage Matrix wiring of new PROPs**:
   - REQ-002 → ...PROP-031 (line 229).
   - REQ-008 → ...PROP-032 (line 235).
   - REQ-017 → ...PROP-031 (line 245).
   - REQ-018 unchanged; PROP-028/029 still cover it.

9. **No new contradictions**:
   - No AC in rev8 still references "programming-error invariant violation" as the throw description (replaced everywhere by the concrete `Error('hydrateNote-invariant-violation: ...')` formulation).
   - No AC in rev8 references in-place filtering inside `hydrateNote`. REQ-017 line 374 records the rejected-alternative explicitly. PROP-027 line 193 asserts the negation ("hydrateNote does NOT filter, transform, or re-number blocks").
   - The Purity Boundary Map row for `parseMarkdownToBlocks` (`verification-architecture.md:29`) and `HydrateNote` (line 30) are unchanged but consistent with the new contract: parseMarkdownToBlocks is the sole place blank-line semantics are enforced; HydrateNote is a pure composition.

## Findings count

**0 findings.** No advisory observations are recorded for this iteration.

## Re-gate condition

**PASS** — proceed to Phase 2a sprint-N (where N is the next sprint after the converged copy-body sprint 3 per state.json).

The rev8 delta correctly resolves sprint-5 FIND-030 and FIND-031 at the spec layer (Q5=A, Q6=A). Phase 2a may begin without further spec rework. Sprint-5 FIND-032/FIND-034 (test coverage), FIND-033 (code structure), FIND-035 (naming) are explicitly deferred to Phase 2 per the rev8 revision-log entry; that deferral is appropriate at the spec gate.

## What I verified directly (positive evidence)

- `behavioral-spec.md:201-202` — REQ-008 AC throw contract: exact-message, propagation, corruptedFiles-empty invariant.
- `behavioral-spec.md:372` — REQ-017 AC blank-line/whitespace contract.
- `behavioral-spec.md:374` — REQ-017 rejected-alternative for in-place hydrateNote filter.
- `behavioral-spec.md:109` — REQ-002 AC follow-through on parser contract.
- `verification-architecture.md:88-105` — port-contract docstring for `ParseMarkdownToBlocks` carries the rev8 contract.
- `verification-architecture.md:193` — PROP-027 Q5=A no-filter clause.
- `verification-architecture.md:195` — PROP-029 Q5=A Ok([]) ↔ whitespace-only body clause.
- `verification-architecture.md:197` — PROP-031 inputs and property statement.
- `verification-architecture.md:198` — PROP-032 regex and stub harness.
- `verification-architecture.md:229,235,245` — Coverage Matrix wires PROP-031, PROP-032.
- `verification-architecture.md:250` — total PROP count = 32; required:true count = 11.
- `docs/domain/code/ts/src/shared/snapshots.ts:33-38` — `HydrationFailureReason` union matches spec REQ-002 AC line 105.
- `docs/domain/code/ts/src/shared/snapshots.ts:46-48` — `ScanFileFailure` discriminated union (`'read'` / `'hydrate'`) matches spec REQ-002 AC line 104.
- `docs/domain/code/ts/src/shared/blocks.ts:49-50` — `ParseMarkdownToBlocks` signature matches `verification-architecture.md:103-105`.
- `docs/domain/code/ts/src/curate/ports.ts:14-20` — `HydrateNote` docstring matches spec rev7/rev8 (calls `parseMarkdownToBlocks(snapshot.body)`, no frontmatter parsing).
- `docs/domain/code/ts/src/shared/value-objects.ts:69-76` — `BlockId` brand and the "or `block-<n>`" allocator path acknowledged in the type contract; `parseMarkdownToBlocks` is constrained to use that path per `verification-architecture.md:29`.
