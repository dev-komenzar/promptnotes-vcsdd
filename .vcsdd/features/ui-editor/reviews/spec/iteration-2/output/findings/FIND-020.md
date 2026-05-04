---
id: FIND-020
severity: minor
dimension: verification_readiness
category: test_quality
targets:
  - "verification-architecture.md PROP-EDIT-002 (line 155)"
  - "verification-architecture.md PROP-EDIT-009 (line 162)"
  - "verification-architecture.md §6 Coverage Matrix REQ-EDIT-026 row (line 296)"
introduced_in: iteration-2
---

## Observation

PROP-EDIT-002 (line 155 of `verification-architecture.md`):

> Every `EditorCommand` in the `commands` array produced by `editorReducer` for any save-triggering action carries a `source` field drawn exclusively from `'capture-idle' | 'capture-blur'` (domain-events.md:115), and the value equals the `source` passed in the triggering action payload. The UI layer never omits, infers, or uses `'idle'`, `'blur'`, `'switch'`, `'manual'`, or any other string.

PROP-EDIT-009 (line 162 of `verification-architecture.md`):

> Every `EditorCommand` in the `commands` array produced by `editorReducer` for a save-triggering action carries the `source` value that was present in the action's payload, unchanged. The reducer does not infer, transform, or default the `source` field. The `source` value is always `'capture-idle' | 'capture-blur'`.

These two property statements are near-identical: both target `editorReducer.ts`, both are Tier 2 fast-check, both cite REQ-EDIT-026 and domain-events.md:115, both assert that the reducer passes through the `source` field unchanged. The Coverage Matrix (line 296) lists both PROPs under REQ-EDIT-026.

The textual differences are cosmetic:
- PROP-EDIT-002 adds the negative form ("never omits, infers, or uses `'idle'/'blur'/'switch'/'manual'`").
- PROP-EDIT-009 adds the precise verbal "unchanged".

Both will be implemented as essentially the same fast-check property in `editorReducer.property.test.ts`.

## Why it fails

A duplicate proof obligation creates two fail modes:

1. Phase 2 may write the same property twice under different names, inflating apparent coverage without adding rigor.
2. If the implementation drifts and only one test is updated, the duplicates may disagree, and reviewers must triage which one is canonical.

Strict mode disallows redundant obligations because they obscure what is actually being proved.

## Concrete remediation

Merge into a single property. Recommended: keep PROP-EDIT-009 (the cleaner statement of the unchanged-pass-through invariant) and delete PROP-EDIT-002. Update the Coverage Matrix REQ-EDIT-026 row (line 296) to cite only PROP-EDIT-009. If PROP-EDIT-002's negative-form clause is judged useful, fold it into PROP-EDIT-009 as: "...the reducer does not infer, transform, or default the `source` field, and the values `'idle'`, `'blur'`, `'switch'`, `'manual'` MUST NOT appear in any `EditorCommand.source` field (compile-time enforced by §3 Tier 0 branded `SaveSource` type)."
