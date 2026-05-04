---
id: FIND-018
severity: minor
dimension: spec_fidelity
targets: ["behavioral-spec.md §4 NFR-EDIT-002", "behavioral-spec.md §3.5 REQ-EDIT-015", "verification-architecture.md PROP-EDIT-030", "verification-architecture.md PROP-EDIT-033"]
---

## Observation

REQ-EDIT-015 (line 234-237) requires the save-failure banner to have `role="alert"`. NFR-EDIT-002 (line 432) requires the banner to have BOTH `role="alert"` AND `aria-live="assertive"`.

WAI-ARIA 1.2 specifies that `role="alert"` already implies `aria-live="assertive"` and `aria-atomic="true"`. Adding the explicit `aria-live="assertive"` is redundant but not wrong. However, PROP-EDIT-030 (line 140) only checks `role="alert"`; PROP-EDIT-033 (line 143) only checks ARIA via `axe-core`. There is no test that asserts the explicit `aria-live` attribute, so an implementation that drops it would still pass both PROPs.

If NFR-EDIT-002 is intended to enforce both attributes, a test must check both. If `role="alert"` alone is sufficient, NFR-EDIT-002 is over-prescribed.

## Why it fails

Minor severity because the user-facing behavior is identical (screen readers honor the implicit live region from `role="alert"`). But strict mode requires NFR claims to be testable, and this one is not as currently written.

## Concrete remediation

Pick one:
- Option A: Drop the explicit `aria-live="assertive"` clause from NFR-EDIT-002 (rely on `role="alert"`'s implicit live region). Update the acceptance bullet at line 437 to "The save-failure banner root element has `role=\"alert\"`. (No explicit `aria-live` attribute is required since `role=alert` implies `aria-live=assertive` per WAI-ARIA 1.2.)"
- Option B: Keep both and add a PROP-EDIT-XXX integration assertion: `getByTestId('save-failure-banner')` has both `role="alert"` and `aria-live="assertive"` attributes literally present.
