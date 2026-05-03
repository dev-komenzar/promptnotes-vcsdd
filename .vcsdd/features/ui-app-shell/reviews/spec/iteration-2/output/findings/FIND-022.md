# FIND-022: DESIGN.md §10 attributes the modal overlay scrim rgba(0,0,0,0.5) to a non-existent §4 token

- **id**: FIND-022
- **severity**: minor
- **dimension**: spec_fidelity

## citation
- `DESIGN.md:347` (§10 Token Reference rgba table: "Modal overlay scrim | `rgba(0,0,0,0.5)` | §4 Distinctive Components (modal backdrop)")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:445-468` (REQ-019 inherits §10 as the normative source; the modal scrim is included in the rgba allow-list via this attribution)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:303` (PROP-006 rgba allow-list: "`rgba(0,0,0,0.5)   — Modal overlay scrim (追加 — FIND-012 解消)`")

## referenceCitation
- `DESIGN.md:161-178` (§4 Distinctive Components — the cited source section. Lines 161-178 cover "Feature Cards with Illustrations", "Trust Bar / Logo Grid", and "Metric Cards". There is no modal backdrop, no scrim, no `rgba(0,0,0,0.5)`, and no overlay treatment defined.)
- `DESIGN.md:91-179` (§4 Component Stylings — entire section. Buttons, Cards & Containers, Inputs & Forms, Navigation, Image Treatment, Distinctive Components. None of these subsections define a modal backdrop or `rgba(0,0,0,0.5)`.)

## description
The §10 Token Reference attributes `rgba(0,0,0,0.5)` to "§4 Distinctive Components (modal backdrop)". This citation is incorrect: §4 contains no modal-backdrop definition and no `rgba(0,0,0,0.5)` value. The token is invented in §10.

This affects the integrity of the iteration-2 fix for FIND-012. The Builder added `rgba(0,0,0,0.5)` to PROP-006 with the comment "FIND-012 解消" and pointed §10 at §4 as the canonical source. But §10 is supposed to be a *reference* table that mirrors values defined elsewhere in DESIGN.md — its description at line 313 says: "Any hex or rgba value used in Svelte components, TypeScript files, or CSS must appear in this section." That contract is fine; the broken half is the "Source" column claiming §4 owns the value when §4 in fact does not.

Consequences:

1. A maintainer reading §10 row "Modal overlay scrim" and following the citation to §4 finds nothing actionable about modal backdrops. The DESIGN.md §10 table fails its own stated purpose of being a *reference* to the prose.
2. The audit script `scripts/audit-design-tokens.ts` reads §10 as the allow-list. The script will accept `rgba(0,0,0,0.5)` because §10 lists it, even though the prose token system has not actually defined a modal scrim. This produces verification by self-reference: the allow-list permits the value because the allow-list says so.
3. If a future REQ adds a different overlay opacity (e.g., `rgba(0,0,0,0.4)` per Material Design), the Builder will face the same authoring problem with no §4 prose to amend.

This is a minor finding because the value itself is reasonable (0.5 is a common backdrop opacity) and the audit will work correctly in practice. But strict mode requires citations to be checkable.

## suggestedRemediation
Pick one of:

(A) **Add the missing prose to §4**: extend "§4 Distinctive Components" with a "Modal & Overlay" subsection that defines the backdrop pattern: "Modal overlay scrim: `rgba(0,0,0,0.5)` full-viewport backdrop behind centered Deep-Card-Level-3 modals (e.g., VaultSetupModal). The 0.5 opacity is chosen to satisfy WCAG dimming guidance while preserving page silhouette." Then §10's citation becomes valid.

(B) **Re-attribute the token in §10**: change "§4 Distinctive Components (modal backdrop)" to "§10 Token Reference (introduced for ui-app-shell modal backdrop)" and add a one-line note that §10 originates this token rather than mirroring §1-§9. State explicitly that §10 may introduce tokens that are not in earlier prose, with the trade-off documented.

(C) **Redirect to the spec source-of-truth**: change the citation to "`.vcsdd/features/ui-app-shell/specs/behavioral-spec.md` REQ-016 (modal blocks UI; backdrop is implied)" — but this is weak, since REQ-016 doesn't actually define an opacity value either. Probably (A) or (B).

This finding is minor because it does not break behavior; it breaks documentation integrity.

## introducedIn
iteration-2-revision (DESIGN.md §10 was added by the Builder in iteration-2; the §4-attribution error is intrinsic to the new section. iteration-1 did not have this section so the issue could not have existed.)
