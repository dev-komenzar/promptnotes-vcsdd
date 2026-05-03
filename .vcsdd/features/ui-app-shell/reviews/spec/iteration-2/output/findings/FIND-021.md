# FIND-021: PROP-006 spacing allow-list disagrees with REQ-011 AC and overshoots DESIGN.md §5

- **id**: FIND-021
- **severity**: major
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:310-312` (PROP-006 spacing allow-list: "`[2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32, 48, 64, 80, 120]`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:327` (REQ-011 AC: "`<main>` 内のスペーシング値は DESIGN.md スペーシングスケール（2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 16, 24, 32px）の値のみを使用する")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:610` (NFR-07: "DESIGN.md 8px ベーススケールのみ（REQ-011）")

## referenceCitation
- `DESIGN.md:184` ("Scale: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px") — the canonical spacing scale, 13 values.
- `DESIGN.md:185` ("Non-rigid organic scale with fractional values (5.6px, 6.4px) for micro-adjustments") — adds 5.6 and 6.4 as edge cases, but does not add 48/64/80/120 to the scale.
- `DESIGN.md:195-205` and `DESIGN.md:251` mention 64, 80, 120 only in prose for "vertical rhythm between major sections" and "hero padding", not as members of the spacing scale itself.

## description
The behavioral spec and the verification architecture disagree on which spacing values are permissible in `ui-app-shell` source files:

- **REQ-011 AC (behavioral, normative)**: 13 values exactly: `2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 16, 24, 32`.
- **PROP-006 verification list**: 19 values: adds `5.6, 6.4, 48, 64, 80, 120`.

This affects the audit outcome of `scripts/audit-design-tokens.ts` (PROP-006). If two engineers implement the audit per-spec:
- Engineer A reads REQ-011 → script flags any `5.6`, `6.4`, `48`, `64`, `80`, `120` as a violation.
- Engineer B reads PROP-006 → script accepts those values.

REQ-011 is normative ("spec_fidelity") and PROP-006 is the verification artifact ("verification_readiness"). They MUST agree because PROP-006 is supposed to be the falsifiable proof of REQ-011, not a parallel definition.

Furthermore, PROP-006's six "extra" values are partly defensible (`5.6`, `6.4` are explicitly named in DESIGN.md §5 line 185) and partly not (`48, 64, 80, 120` only appear in DESIGN.md prose about hero/section vertical rhythm, not in the §5 spacing scale). PROP-006 cites "DESIGN.md §5 より" as its source, but `48, 64, 80, 120` are not in §5's enumerated scale. The list is therefore overbroad: it accepts a hero hardcoded `padding: 80px` even though §5 does not list 80 as a scale value.

This is the verification-side analogue of iteration-1 FIND-012 (rgba allow-list inconsistency), which the Builder fixed for rgba but not for spacing.

## suggestedRemediation
Pick one of:

(A) **Tighten PROP-006 to match REQ-011**: change the spacing allow-list at verification-architecture.md:312 to `[2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 16, 24, 32]`. Add `5.6, 6.4` only if REQ-011 is also extended to mention them. Drop `48, 64, 80, 120` entirely. If hero/section vertical rhythm needs values larger than 32, derive them as multiples (e.g., `2 * 32 = 64`) at the CSS level, and update REQ-011 to allow either scale members or integer multiples of 8 (the base unit) — this should be a deliberate design decision, not an audit-list expansion.

(B) **Loosen REQ-011 to match PROP-006**: change line 327's enumeration to `[2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32, 48, 64, 80, 120]`, and justify each addition with a DESIGN.md citation. For `48, 64, 80, 120` specifically, cite DESIGN.md §5 line 195 ("64-120px between major sections") and §5 line 251 ("80px+ -> 48px on mobile") and add an explicit DESIGN.md §10-style table row.

Whichever path is chosen, the two lists MUST be character-identical, and the source-of-truth (DESIGN.md §5 plus possibly §10 spacing token table) must explicitly enumerate every value.

## introducedIn
always-present (the inconsistency existed in iteration-1 — the rgba half was caught by FIND-012, the spacing half was not. This is therefore a partial-resolution finding for the iteration-1 FIND-012 family, surfaced as a new finding under iteration-2's heightened scrutiny.)
