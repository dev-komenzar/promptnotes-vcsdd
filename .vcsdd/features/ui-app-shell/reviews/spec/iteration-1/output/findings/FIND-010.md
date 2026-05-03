# FIND-010: REQ-013 cites the wrong DESIGN.md section for the Card Shadow stack

- **id**: FIND-010
- **severity**: minor
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:276` (REQ-013 EARS: "the exact 4-layer stack defined in `DESIGN.md §6`")

## referenceCitation
- `DESIGN.md:54` — Card Shadow definition lives in §2 ("Shadows & Depth" subsection of "Color Palette & Roles"), not §6.
- `DESIGN.md:208-218` — §6 ("Depth & Elevation") only references the shadow stack by qualitative name ("4-layer shadow stack (max opacity 0.04)"), it does not contain the exact rgba values.

## description
REQ-013 directs the implementer to use "the exact 4-layer stack defined in DESIGN.md §6". The exact rgba quadruplet is in §2 (line 54). §6 only describes the elevation level qualitatively. An implementer who follows the section anchor literally would not find the exact values. The spec then re-prints the stack inline, but the wrong cross-reference still teaches the wrong source-of-truth pointer for future maintenance.

## suggestedRemediation
Change "DESIGN.md §6" to "DESIGN.md §2 (Shadows & Depth)". Apply the same correction to REQ-017 (line 337 — "DESIGN.md §2 Shadows & Depth" — that one is correct, so just verify the asymmetry is intentional). Cross-check every `DESIGN.md §N` citation in the spec against the actual section headings in `DESIGN.md`.
