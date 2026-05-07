# VCSDD Phase 1c Review — copy-body sprint 3 (iteration 2)

**Reviewer**: vcsdd-adversary (fresh-context, lean mode)
**Date**: 2026-05-07
**Iteration**: 2 (after iteration-1 FAIL)
**Artifacts under review**:
- `.vcsdd/features/copy-body/specs/behavioral-spec.md` (sprint 3, revision 3)
- `.vcsdd/features/copy-body/specs/verification-architecture.md` (sprint 3, revision 3)
- `.vcsdd/features/copy-body/state.json` (PROP-012 registration)

---

## Per-dimension verdicts

| # | Dimension | Verdict | Notes |
|--:|-----------|:-------:|-------|
| 1 | Coverage — every REQ has ≥1 PROP, no orphan PROPs, PROP-011/012 link to REQ-013/014/008 | PASS | REQ-001..REQ-014 all referenced in the Proof Obligations REQ column (`verification-architecture.md:102-115`). PROP-012 cites REQ-008 (line 115); PROP-011 cites REQ-013 + REQ-014 (line 114); PROP-002 also reinforces REQ-013 (line 105). No orphan PROPs. |
| 2 | Block-migration correctness — REQ-002 / REQ-007 reflect blocks-derived body, not stored `Note.body` | PASS | REQ-002 (`behavioral-spec.md:61`) returns `serializeBlocksToMarkdown(note.blocks)`; line 79 explicitly says "it is **not** a separately stored `note.body` field (no such field exists on the `Note` type)". REQ-007 (line 154-167) and Implementation Notes derivation chain (lines 358-365) consistently use blocks. |
| 3 | Implementation guidance — REQ-014 mandate is unambiguous | PASS | REQ-014 (`behavioral-spec.md:281`) names the canonical import (`../capture-auto-save/serialize-blocks-to-markdown.js`), gives concrete acceptance criteria including PROP-011 spy assertion (line 289), and explicitly forbids a duplicate prefix table (line 290). REQ-013 (line 274) reinforces "no `switch`/`if`-chain over `block.type` values". |
| 4 | Empty-body re-definition — minimal-block fixtures now include `id` (FIND-001 fix verification) | PASS | REQ-007 EARS fixture: `[{ id: <BlockId>, type: "paragraph", content: "" }]` (line 154); brevity note at line 158 grounds the `<BlockId>` placeholder in Block invariant 1; all three fixture examples (lines 165-167) and acceptance criteria (lines 170-171) use the `id`-bearing shape. PROP-008 (`verification-architecture.md:111`) mirrors the same wording and explicitly says generators construct "full `{ id, type, content }` shapes". |
| 5 | Internal consistency — REQ-005 names `emitInternal`; FIND-002/004 fixes applied; no new contradictions | PASS | REQ-005 EARS (`behavioral-spec.md:126`) now reads "via the internal Capture event bus (`CopyBodyInfra.emitInternal`), NOT via `CaptureDeps.publish`", consistent with REQ-003 fifth bullet (line 102) and `verification-architecture.md:74,88-91`. REQ-002 disambiguation note added at line 81. REQ-009 reconciliation collapsed to a single line at line 212. No new contradictions introduced. |

---

## Resolution status of prior findings

| Prior finding | Status | Evidence |
|---------------|:------:|----------|
| FIND-001 (major) — REQ-007 / PROP-008 fixtures must include `Block.id` | RESOLVED | `behavioral-spec.md:154` — `note.blocks === [{ id: <BlockId>, type: "paragraph", content: "" }]`; line 158 — brevity note ("`<BlockId>` denotes any valid `BlockId` value; generators construct fresh IDs per Block invariant 1"); lines 165-167 — all three fixture examples carry `id: <BlockId>`; lines 170-171 — acceptance criteria match. `verification-architecture.md:111` — PROP-008 echoes the `id`-bearing shape and adds "*generators* change to construct `blocks`-shaped notes with full `{ id, type, content }` shapes". |
| FIND-002 (minor) — REQ-002 prefix-table disambiguation | RESOLVED | `behavioral-spec.md:81` — "**Note**: This table is informational; it MUST NOT be reproduced inside `body-for-clipboard.ts` (see REQ-013/REQ-014). The canonical implementation lives in `promptnotes/src/lib/domain/capture-auto-save/serialize-blocks-to-markdown.ts`." Matches the recommendation in iteration-1 FIND-002 verbatim. |
| FIND-003 (major) — REQ-005 EARS must say `emitInternal`, not `CaptureDeps.publish` | RESOLVED | `behavioral-spec.md:126` — "...the system SHALL publish exactly one `NoteBodyCopiedToClipboard { kind: \"note-body-copied-to-clipboard\", noteId, occurredOn }` event via the internal Capture event bus (`CopyBodyInfra.emitInternal`), NOT via `CaptureDeps.publish`." Now consistent with REQ-003 fifth bullet (line 102) and the architecture purity-boundary map (line 29) + NOT-used-ports section (line 74). |
| FIND-004 (minor) — REQ-009 stale "Reconciliation" paragraph | RESOLVED | `behavioral-spec.md:212` — collapsed to a single line: "Timestamp budget is stated directly in REQ-003 and verified by PROP-004 / PROP-005." Matches the iteration-1 recommendation verbatim. |
| FIND-005 (minor) — REQ-008 has no PROP; needed PROP-012 (Tier 0) | RESOLVED | `verification-architecture.md:115` — PROP-012 added: Tier 0, required, statement covers `makeCopyBodyPipeline` shape + flat-ports `copyBody` + `EditingState` narrowing, verification via `tsc --noEmit` plus a type-level test file `__verify__/prop-012-pipeline-shape.types.test.ts`, REQ column cites REQ-008. Line 124 updates the count to "twelve props … sprint 3 adds PROP-011 and PROP-012". Line 201 acceptance gate explicitly says "REQ-008 is covered by PROP-012 (Tier 0, type-level)". `state.json:191-196` registers PROP-012 with `tier: 0, required: true, status: "pending"` and the matching artifact path. |

All five iteration-1 findings are RESOLVED.

---

## Overall verdict

**PASS**

All five dimensions PASS. Every iteration-1 finding has been addressed with concrete textual fixes that match (or exceed) the prior recommendations. No new findings.

---

## Summary

The sprint 3 revision-3 specification eliminates the two major contradictions (block fixtures lacking `id`; REQ-005 EARS naming the wrong port) and the three minor drift items (REQ-002 disambiguation, REQ-009 stale reconciliation, REQ-008 PROP coverage). The internal channel for `NoteBodyCopiedToClipboard` is now coherently described across REQ-003, REQ-005, and the verification architecture's purity-boundary map / NOT-used-ports / `CopyBodyInfra` callback section. PROP-012 is registered in `state.json` with the artifact path matching the harness layout.

Phase 1c lean spec gate is satisfied. No further iterations required.
