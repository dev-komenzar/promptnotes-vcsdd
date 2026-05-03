# FIND-012: REQ-019 / PROP-006 allow-lists are inconsistent and contain a duplicate

- **id**: FIND-012
- **severity**: minor
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:362-368` (REQ-019: "`rgba(0,0,0,X)` の X 値が DESIGN.md に定義されたものに限定される" — but DESIGN.md does not enumerate the X values explicitly)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:271-283` (PROP-006 explicit allow-lists for hex and rgba and spacing)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:277` ("rgba(0,0,0,0.95), rgba(0,0,0,0.1), rgba(0,0,0,0.05), rgba(0,0,0,0.9), rgba(0,0,0,0.04), rgba(0,0,0,0.027), rgba(0,0,0,0.02), rgba(0,0,0,0.01), rgba(0,0,0,0.05)" — `0.05` listed twice)

## referenceCitation
- `DESIGN.md:54-56` — Card Shadow uses 0.04, 0.027, 0.02, 0.01. Deep Shadow uses 0.01, 0.02, 0.02, 0.04, 0.05. Whisper Border uses 0.1.
- `DESIGN.md:5` — Near-black text is 0.95.
- `DESIGN.md:111` — Secondary button background is 0.05.
- `DESIGN.md:139` — Input text is 0.9.

## description
Two issues:
1. REQ-019 says rgba X-values are restricted to "those defined in DESIGN.md" but DESIGN.md never enumerates them as a list — they are inferred by reading the prose of every component description. Two engineers will produce two different lists. PROP-006 attempts to fix this by giving an explicit list, but that list lives in `verification-architecture.md`, not `behavioral-spec.md`. The behavioral spec's normative requirement therefore points at an under-defined source.
2. The PROP-006 allow-list at `verification-architecture.md:277` contains `rgba(0,0,0,0.05)` twice (once after `rgba(0,0,0,0.1)` and once at the end). Either this is a typo, or one occurrence was meant to be a different value (e.g. the missing 0.027 in some position, or a missing 0.04 — but those appear elsewhere in the list). The duplication reduces reviewer confidence that the list is comprehensive.

Additionally, the list omits `rgba(0,0,0,0.5)` overlay scrims commonly needed for modals. If `VaultSetupModal` (REQ-017, with Deep Shadow) needs an overlay backdrop, no allow-listed rgba value provides it. PROP-006 would then fail any reasonable backdrop implementation.

## suggestedRemediation
- Move the explicit hex and rgba allow-lists from `verification-architecture.md` into `behavioral-spec.md` (under REQ-019), so the normative requirement and the verification artifact share one source of truth.
- Deduplicate `rgba(0,0,0,0.05)`. State explicitly which prose source in DESIGN.md justifies each entry.
- Add a row for the modal overlay scrim (or explicitly forbid an overlay scrim and require a different visual treatment).
