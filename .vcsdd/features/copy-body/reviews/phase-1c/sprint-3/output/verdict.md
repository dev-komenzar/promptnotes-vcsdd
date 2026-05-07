# VCSDD Phase 1c Review — copy-body sprint 3

**Mode**: lean
**Reviewer**: vcsdd-adversary (fresh-context)
**Date**: 2026-05-07
**Artifacts under review**:
- `.vcsdd/features/copy-body/specs/behavioral-spec.md` (revision 2, sprint 3)
- `.vcsdd/features/copy-body/specs/verification-architecture.md` (revision 2, sprint 3)

## Per-dimension verdict

| # | Dimension | Verdict | Findings |
|---|-----------|:-------:|----------|
| 1 | Coverage (REQ↔PROP traceability, sprint-3 chain REQ-013/014 ↔ PROP-002/011) | PASS | FIND-005 (minor) |
| 2 | Block-migration correctness (REQ-002 / REQ-007 drop `Note.body`; serializer table matches reference impl) | PASS | FIND-002 (minor) |
| 3 | Implementation guidance (REQ-014 delegation mandate; deferred shared-kernel finding) | PASS | — |
| 4 | Empty-body re-definition (REQ-007 / PROP-008 reframe to `[{ type: "paragraph", content: "" }]`; consistent with `blocks.length >= 1`) | FAIL | FIND-001 (major) |
| 5 | Internal consistency (behavioral-spec ↔ verification-architecture; REQ↔PROP wording; tier assignments) | FAIL | FIND-003 (major), FIND-004 (minor) |

## Overall verdict

**FAIL**

## Summary

The sprint-3 migration intent — replacing the obsolete `Note.body` stored field with the derived `serializeBlocksToMarkdown(note.blocks)` and adding REQ-013/REQ-014/PROP-011 to lock the delegation contract — is well-articulated and the new traceability chain (REQ-013 ↔ PROP-002, REQ-014 ↔ PROP-011) is sound. The block-type → Markdown prefix mapping documented in REQ-002 lines 67–77 is byte-identical to the reference implementation in `promptnotes/src/lib/domain/capture-auto-save/serialize-blocks-to-markdown.ts:30-47`, and the cross-feature import is correctly recorded as a deferred non-blocking finding in `verification-architecture.md:192`.

However, the spec is **not internally self-consistent enough to clear Phase 1c**:

1. **FIND-001 (major)**: The minimal-block fixtures in REQ-007 (lines 154, 161, 162, 163) and the `isEmpty` re-definition omit the required `Block.id: BlockId` field. Per `docs/domain/code/ts/src/shared/note.ts:47-51`, every `Block` is `{ id, type, content }`; the spec's `[{ type: "paragraph", content: "" }]` shape is type-incompatible and will not satisfy the `Note.blocks: ReadonlyArray<Block>` invariant. Phase 2a generators built from these examples will fail to typecheck against the canonical `Note` type, defeating the migration's purpose.

2. **FIND-003 (major)**: REQ-005's EARS clause (line 124) says the event is published "via `CaptureDeps.publish`", but the rest of REQ-005 (lines 128–135), REQ-003 (line 100: "`CaptureDeps.publish` ... is invoked **zero** times"), and the entire `verification-architecture.md` Port Contracts section (line 74: "`EventBusPublish` ... CopyBody emits an **internal** event, not a `PublicDomainEvent`") explicitly forbid use of `CaptureDeps.publish`. The emission channel is `emitInternal`. This is a direct contradiction within a single requirement; it likely predates sprint 3 but remains in the spec under review and is grade-blocking.

These two issues make the sprint-3 spec untestable without correction (either the REQ text or the Phase 2a fixture authors would have to silently invent the missing fields/channel). The minor findings (FIND-002, FIND-004, FIND-005) should be folded into the same Phase 4 routing.

Recommend routing all five findings to Phase 1a (FIND-001, FIND-002, FIND-003, FIND-004 — behavioral spec) and Phase 1b (FIND-005 — orphan REQ-008 PROP coverage) via `/vcsdd-feedback`, then re-running Phase 1c.
