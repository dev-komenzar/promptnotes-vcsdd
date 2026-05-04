---
id: FIND-001
severity: critical
dimension: verification_readiness
targets: ["PROP-EDIT-022", "PROP-EDIT-023", "verification-architecture.md §3 Tier-Integration table", "behavioral-spec.md §3.8 RD-001", "domain-events.md:115"]
---

## Observation

`verification-architecture.md` lines 132-133 define two integration-tier proof obligations whose stated property literals contradict the domain enum that the same document and `behavioral-spec.md §9 RD-001` declare authoritative.

- PROP-EDIT-022 (line 132): "blur event while `isDirty === true` dispatches `TriggerBlurSave { source: \"blur\" }`"
- PROP-EDIT-023 (line 133): "advancing time by exactly `IDLE_SAVE_DEBOUNCE_MS` (2000ms) fires `TriggerIdleSave { source: \"idle\" }`"

`docs/domain/domain-events.md:115` enumerates the only valid `source` literals: `'capture-idle' | 'capture-blur' | 'curate-tag-chip' | 'curate-frontmatter-edit-outside-editor'`. `'idle'` and `'blur'` do not exist in the domain enum. `behavioral-spec.md §3.8` (REQ-EDIT-026) and §9 RD-001 explicitly forbid those values: "any other string is a compile-time type error".

## Why it fails

These two PROPs are the integration-tier acceptance criteria for the dispatch-on-blur and dispatch-on-idle behaviour. If a Phase 2 implementer takes them literally they will write tests asserting the wrong literal — and an implementation that satisfies those tests would emit type-invalid payloads that the rest of the system (per RD-001) is forbidden to accept. This is a direct, demonstrable contradiction inside the spec set, in strict mode, on the most fundamental property of the feature (source discrimination).

## Concrete remediation

Edit `verification-architecture.md` PROP-EDIT-022 to assert `TriggerBlurSave { source: "capture-blur" }` and PROP-EDIT-023 to assert `TriggerIdleSave { source: "capture-idle" }`. Add a one-line cross-reference to `domain-events.md:115` and `behavioral-spec.md §9 RD-001` directly inside both PROP rows so future reviewers can cross-check at a glance.
