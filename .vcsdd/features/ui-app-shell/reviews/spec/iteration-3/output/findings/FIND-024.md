# FIND-024: verification-architecture.md "Source of truth" header omits REQ-022 — claims coverage only of REQ-001〜REQ-021 while iteration-3 introduced REQ-022

- **id**: FIND-024
- **severity**: minor
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:8` ("- `specs/behavioral-spec.md` (REQ-001〜REQ-021, NEG-REQ-001〜NEG-REQ-005)")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:525-547` (REQ-022 added in iteration-3 — IPC タイムアウトポリシー)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:87` (PROP-014 entry references REQ-022)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:591` (trace table row "REQ-022 | PROP-014 | `app-shell.unit.test.ts`")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:28` (iter-3 revision history line: "FIND-019 (MAJOR) + FIND-013 partial | PROP-014 (新規), REQ-022 トレーサビリティ | IPC タイムアウト検証を PROP-014 として追加")

## referenceCitation
- `.vcsdd/features/ui-app-shell/reviews/spec/iteration-2/output/findings/FIND-019.md:35-41` (the iter-2 finding requested adding REQ-022 + PROP-014; the Builder added both, but did not propagate the new REQ identifier into the verification-architecture's "Source of truth" header)

## description
The verification-architecture.md "Source of truth" header at line 8 enumerates the requirement range it is derived from as `REQ-001〜REQ-021`. Iteration-3 introduced REQ-022 (IPC timeout policy) and added PROP-014 to cover it. The body of verification-architecture.md was updated to include PROP-014 (line 87), the proof-obligation detail section (line 492-533), and the trace table (line 591). However, the Source-of-truth header range was not extended to `REQ-001〜REQ-022`.

Why this matters under strict mode:

1. **Self-referential inconsistency**. The same document at line 28 (revision history) explicitly records "REQ-022 トレーサビリティ" being added, while line 8 still claims the document is built against REQ-001〜REQ-021. A reader cross-checking the header against the body sees two contradictory statements about the document's scope.

2. **Coverage-completeness audit risk**. The trace table at line 591 lists REQ-022 → PROP-014, and line 598 says "すべての REQ に PROP が割り当てられており、未バインドの要件は存在しない". But the header range bounds what "すべての REQ" means. If a reviewer reads only the header and cross-references against `behavioral-spec.md` (which contains REQ-001 through REQ-022), they would conclude REQ-022 is unbound — even though it is, in fact, bound by PROP-014 inside the body.

3. **Iter-3 scope discipline**. The iteration-3 revision was supposed to "complete" the spec gate. Leaving the source-of-truth header at the iter-2 range is exactly the kind of partial / superficial resolution that strict mode iteration-3 is meant to prevent — the body changed but the metadata header that describes the body's scope did not.

This is classified minor (not major) because:
- The defect is documentation-only; PROP-014 is correctly entered into the body and trace table, so Phase 2a test authors will not miss the obligation.
- No engineer would write incorrect test code based on this header alone, given the trace table is authoritative.
- However, it is a real, citable inconsistency that strict mode forbids leaving open.

## suggestedRemediation
Update verification-architecture.md line 8 from:

```
- `specs/behavioral-spec.md` (REQ-001〜REQ-021, NEG-REQ-001〜NEG-REQ-005)
```

to:

```
- `specs/behavioral-spec.md` (REQ-001〜REQ-022, NEG-REQ-001〜NEG-REQ-005)
```

This is a one-character fix (`1` → `2`). Verify the body (PROP-014, trace table line 591, untranslated REQ list at line 598) is consistent after the change. Optionally, consider listing each REQ explicitly rather than as a range to prevent recurrence on future REQ additions.

## introducedIn
iteration-3-revision (REQ-022 was added in iter-3; the source-of-truth header was not updated to match. The header was correct as of iter-2 because REQ-022 did not exist then.)
