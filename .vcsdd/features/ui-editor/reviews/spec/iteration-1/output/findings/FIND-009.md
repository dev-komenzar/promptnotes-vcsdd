---
id: FIND-009
severity: major
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.6 REQ-EDIT-022", "behavioral-spec.md §3.4 REQ-EDIT-013", "verification-architecture.md PROP-EDIT-006"]
---

## Observation

REQ-EDIT-022 (`behavioral-spec.md:330-339`) says the Copy button is disabled when `Body.isEmptyAfterTrim === true` OR `status` is `idle | switching | save-failed`. PROP-EDIT-006 (`verification-architecture.md:116`) restates this as: "`canCopy(body, status)` is `true` iff `body.trim().length > 0` AND `status` is one of `'editing' | 'saving'`."

Two latent issues:

1. The pure predicate `canCopy` is asserted to use `body.trim().length > 0` directly. But §6 Glossary `Body.isEmptyAfterTrim` (line 604) says it is "Equivalent to `note.isEmpty()`", and `note.isEmpty()` is a Rust-side method (per `aggregates.md`). `body.trim()` on a JS string and Rust's `body.trim()` (Unicode whitespace handling, NBSP, ideographic spaces, etc.) are not bit-equivalent. `aggregates.md` does not specify the trim definition. Phase 2 will use JS `.trim()`, the Rust side could use a different definition, and the Copy button would disagree with `prepareSaveRequest`'s empty-body discard path (workflows.md §Workflow 2, `EmptyBodyOnIdleSave`).

2. PROP-EDIT-006's "`canCopy` is `true` iff `body.trim().length > 0` AND `status` is one of `'editing' | 'saving'`" is a stronger claim than REQ-EDIT-022. REQ-EDIT-022 only enumerates *disabled* states. It is silent on a 6th hypothetical status value. PROP-EDIT-006 adds the closure "and only those two states" — that is an additional spec contract not derived from REQ-EDIT-022.

## Why it fails

Issue 1 is a critical-adjacent silent-divergence between the UI's local empty-trim check and the Rust authoritative empty-body decision. The OQ §8 #7 acknowledges the pure check is OK but does not pin the trim semantics. Issue 2 means PROP-EDIT-006 is asserting more than the source REQ — if a future REQ-EDIT relaxes Copy-disable in `save-failed` (e.g., to allow copying before discarding), PROP-EDIT-006 would falsely fail.

## Concrete remediation

(1) Add to OQ §8 #7 (or REQ-EDIT-003) a definitional clause: "`Body.isEmptyAfterTrim === (body.trim().length === 0)` where `String.prototype.trim()` is the ECMAScript 2024 definition. The Rust-side `note.isEmpty()` MUST agree. Phase 2 of the backend save-handler feature must add a Kani-checkable property asserting agreement on Unicode whitespace inputs." (2) Restate PROP-EDIT-006 to read: "for status ∈ {'idle', 'switching', 'save-failed'}, `canCopy === false` regardless of body. For status ∈ {'editing', 'saving'}, `canCopy === !empty-after-trim(body)`." This mirrors REQ-EDIT-022 directly and avoids the closure assumption.
