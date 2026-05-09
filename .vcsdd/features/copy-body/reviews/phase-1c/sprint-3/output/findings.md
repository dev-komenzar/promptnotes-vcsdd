# VCSDD Phase 1c Findings — copy-body sprint 3

**Verdict**: FAIL (2 major + 3 minor)
**Reviewer**: vcsdd-adversary (fresh-context)
**Date**: 2026-05-07

---

## FIND-001 — Minimal-block fixtures omit required `Block.id` field

- **Severity**: major
- **Dimension affected**: 4 (Empty-body re-definition); also touches 2 and 5
- **Locations**:
  - `.vcsdd/features/copy-body/specs/behavioral-spec.md` lines 154, 161-163, 166-167 (REQ-007)
  - `.vcsdd/features/copy-body/specs/verification-architecture.md` line 111 (PROP-008 fixture description)
- **Quote** (`behavioral-spec.md:154`): "WHEN the current note contains only an empty paragraph block (`note.blocks === [{ type: \"paragraph\", content: \"\" }]`)"
- **Quote** (`behavioral-spec.md:161-163`): three minimal-block fixtures all omit `id`.
- **Problem**: Per `docs/domain/code/ts/src/shared/note.ts:47-51`, every `Block` is `{ readonly id: BlockId; readonly type: BlockType; readonly content: BlockContent }`. The fixtures listed are not valid `Block` values, and `Note.blocks: ReadonlyArray<Block>` cannot legally contain them. Phase 2a generators built from these prose examples will either fail to typecheck or silently invent ad-hoc shapes that diverge from production code — the very inconsistency sprint 3 is meant to eliminate.
- **Recommendation**: Phase 1a. Either (a) write fully-specified fixtures (e.g., `[{ id: <BlockId>, type: "paragraph", content: "" }]`) or (b) add an explicit prose note that `id` is elided for brevity and the actual generator constructs fresh `BlockId` values, with a citation of the canonical `Block` type. Option (a) preferred.

## FIND-002 — REQ-002 documents a prefix table that REQ-013 forbids the implementation from carrying

- **Severity**: minor
- **Dimension affected**: 2 and 5
- **Locations**: `behavioral-spec.md:65-77` (REQ-002 prefix table) and `behavioral-spec.md:268, 276` (REQ-013 prohibitions)
- **Problem**: REQ-002 lists the canonical block-type → Markdown prefix table (helpful), but REQ-013 immediately forbids `body-for-clipboard.ts` from carrying its own copy. An implementer reading REQ-002 in isolation may treat the table as a normative implementation contract for `body-for-clipboard.ts` and find apparent conflict with REQ-013.
- **Recommendation**: Phase 1a. Add a one-line clarifier after the REQ-002 table: "This table is informational; it MUST NOT be reproduced inside `body-for-clipboard.ts` (see REQ-013). The canonical implementation lives in the cited serializer."

## FIND-003 — REQ-005 EARS contradicts itself: `CaptureDeps.publish` vs `emitInternal`

- **Severity**: major
- **Dimension affected**: 5; also touches 1
- **Locations**:
  - `behavioral-spec.md:124` (REQ-005 EARS) — names `CaptureDeps.publish`
  - `behavioral-spec.md:128, 130-135` (REQ-005 channel decision and acceptance criteria) — say `emitInternal`
  - `behavioral-spec.md:100` (REQ-003 acceptance, fifth bullet) — `CaptureDeps.publish` invoked **zero** times
  - `verification-architecture.md:74, 88-91` (NOT-used port + `CopyBodyInfra.emitInternal`)
- **Quote** (`behavioral-spec.md:124`): "the system SHALL publish exactly one `NoteBodyCopiedToClipboard ...` event via `CaptureDeps.publish`."
- **Quote** (`behavioral-spec.md:100`): "`CaptureDeps.publish` (the `PublicDomainEvent` bus) is invoked **zero** times — `NoteBodyCopiedToClipboard` is delivered via the internal `emitInternal` callback in `CopyBodyInfra`, not via `CaptureDeps.publish` (see REQ-005)."
- **Problem**: REQ-005's EARS clause directly names the very port that REQ-003 forbids. The contradiction is also internal to REQ-005 itself. The current implementation `promptnotes/src/lib/domain/copy-body/pipeline.ts:66` already uses `infra.emitInternal`, so the EARS is also at odds with sprint 2's green-phase code. Likely carried over from sprint 2 wording, but blocking at Phase 1c.
- **Recommendation**: Phase 1a. Rewrite REQ-005's EARS to: "... THEN the system SHALL publish exactly one `NoteBodyCopiedToClipboard { kind: \"note-body-copied-to-clipboard\", noteId, occurredOn }` event via the internal Capture event bus (`CopyBodyInfra.emitInternal`), NOT via `CaptureDeps.publish`."

## FIND-004 — REQ-009 / REQ-003 "Reconciliation" paragraph is stale

- **Severity**: minor
- **Dimension affected**: 5
- **Location**: `behavioral-spec.md:208-214` (REQ-009 "Reconciliation with REQ-003" block)
- **Problem**: REQ-003 already states the `clockNow` budget directly. The reconciliation paragraph reads as historical commentary about a previous spec revision. Leaving it in confuses readers and creates drift surface.
- **Recommendation**: Phase 1a. Remove the paragraph or collapse to: "Timestamp budget is stated directly in REQ-003 and verified by PROP-004 / PROP-005."

## FIND-005 — REQ-008 has no dedicated PROP, contradicting the acceptance-gate "1:1 coverage" claim

- **Severity**: minor
- **Dimension affected**: 1
- **Locations**:
  - `behavioral-spec.md:174-198` (REQ-008)
  - `verification-architecture.md:104-114` (Proof Obligations table — no row cites REQ-008)
  - `verification-architecture.md:198-200` (Acceptance Gate: "Behavioral spec REQs are 1:1 covered by PROPs (no orphan REQs)")
- **Problem**: REQ-008's structural / type-level claims (sync return shape, `EditingState`-only narrowing, flat-ports export) are not 1:1 referenced by any PROP. This contradicts the acceptance-gate text. Sprint 2 likely accepted "verified by `tsc`" implicitly, but the gap is now in writing.
- **Recommendation**: Phase 1b. Either add a Tier-0 PROP-012 ("Pipeline shape — `makeCopyBodyPipeline` factory shape; verified by `tsc --noEmit` plus type-level assertions") citing REQ-008, or amend the acceptance-gate language to "1:1 covered by PROPs OR Tier-0 type-level checks (REQ-008)."

---

## Routing recommendation (Phase 4)

| Finding | Route to | Severity | Notes |
|---------|----------|----------|-------|
| FIND-001 | Phase 1a | major | Block fixtures need full `id` shape |
| FIND-002 | Phase 1a | minor | Disambiguate REQ-002 prefix table |
| FIND-003 | Phase 1a | major | Rewrite REQ-005 EARS to name `emitInternal` |
| FIND-004 | Phase 1a | minor | Drop or collapse stale REQ-009 reconciliation |
| FIND-005 | Phase 1b | minor | Add Tier-0 PROP-012 OR relax acceptance gate |

Re-run Phase 1c after Phase 1a/1b revision lands.
