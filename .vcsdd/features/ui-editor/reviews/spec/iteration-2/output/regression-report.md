# Iteration-2 regression report — ui-editor spec review

Status legend: RESOLVED = the iter-1 finding is fully addressed in the revised spec/architecture; PARTIAL = partially addressed; OPEN = unaddressed.

| Iter-1 finding | Severity | Dimension | Status | Resolution location |
|---|---|---|---|---|
| FIND-001 | critical | verification_readiness | RESOLVED | `verification-architecture.md` lines 176-177 (PROP-EDIT-022/023 now use `'capture-blur'`/`'capture-idle'` with cross-references to domain-events.md:115); `behavioral-spec.md §9 RD-001` (line 704) |
| FIND-002 | critical | verification_readiness | RESOLVED | `verification-architecture.md §3 Tier 3` (lines 91-101, 238-253): Stryker replaced with `vitest --coverage` v8 provider; line 253 explicitly forbids future Stryker references. Integration tier (lines 103-145) uses raw Svelte 5 mount API — no `@testing-library/svelte`. PROP-EDIT-033 (line 187) "No `axe-core` dependency required". (Note: a *new* tooling-installation gap surfaces as FIND-019.) |
| FIND-003 | critical | spec_fidelity | RESOLVED | `behavioral-spec.md` REQ-EDIT-025 (line 421) restricts blur-save gate to `editing` + `isDirty=true`; explicit save-failed carve-out (line 421); EC-EDIT-008 (lines 619-623) aligned; PROP-EDIT-020 split into PROP-EDIT-020a/020b in `verification-architecture.md` (lines 173-174); RD-009 (line 712) documents |
| FIND-004 | critical | spec_fidelity | RESOLVED | `behavioral-spec.md §3.4a State Ownership Contract` (line 220) introduces `EditorViewState` as a strict subset of `EditingSessionState`. RD-005 (line 708) and the Glossary (lines 655-657) document. `verification-architecture.md §2` row for `editorReducer.ts` (line 41) cites §3.4a. |
| FIND-005 | critical | spec_fidelity | RESOLVED | `behavioral-spec.md §11 Brand Type Construction Contracts` (line 753) plus RD-013 (line 716). UI sends raw `string`/`number` over Tauri; Rust constructs branded types via `try_new_*`. Glossary entries for `EditNoteBody`/`RequestNewNote` updated (lines 647, 651). |
| FIND-006 | major | verification_readiness | RESOLVED | The phantom "REQ-EDIT-010 auto-focus" reference has been removed from `verification-architecture.md §3` Integration tier responsibilities (lines 134-144 contain no auto-focus mention). |
| FIND-007 | major | verification_readiness | RESOLVED | `verification-architecture.md §2` line 31 introduces a single canonical purity-audit regex covering all forbidden APIs; line 34 declares it "the single canonical purity-audit pattern. It supersedes the shorter list previously appearing in §7." §7 line 337 references the §2 pattern. Pure-tier rows (lines 40-42) cite "All APIs in the canonical purity-audit pattern above." |
| FIND-008 | major | verification_readiness | RESOLVED | `verification-architecture.md §5 Static / lint checks` (lines 256-261) replaces ESLint custom rules with grep audits + `tsc --strict`. PROP-EDIT-029 (line 183) and PROP-EDIT-036 (line 190) restated to use `tsc --strict` + grep. §7 Phase 5 gate (lines 339-340) names the grep commands. |
| FIND-009 | major | spec_fidelity | RESOLVED | `behavioral-spec.md` RD-006 (line 709) pins `body.trim().length === 0` (ECMAScript 2024 `String.prototype.trim`). PROP-EDIT-006 (`verification-architecture.md` line 86 and 159) restated to FIND-009 form: "for status ∈ {'idle','switching','save-failed'}, canCopy === false; for status ∈ {'editing','saving'}, canCopy === !isEmptyAfterTrim". |
| FIND-010 | major | spec_fidelity | RESOLVED | `behavioral-spec.md` REQ-EDIT-024 (line 400) "while focus is within the editor pane root element... NOT the global `document`"; line 404 "panelRoot.addEventListener". `verification-architecture.md §2` keyboardListener.ts row (line 53) "Registers `panelRoot.addEventListener('keydown', ...)` on the editor pane root element (NOT `document.addEventListener`)." RD-008 (line 711) documents. |
| FIND-011 | major | spec_fidelity | RESOLVED | `behavioral-spec.md` REQ-EDIT-023 (lines 383-388) introduces a 5-state enable matrix for the New Note button. REQ-EDIT-009/011/012/013 each have an explicit acceptance bullet for New Note enable/disable. RD-014 (line 717) summarises. |
| FIND-012 | major | verification_readiness | RESOLVED | `behavioral-spec.md §12 Debounce Contract` (lines 785-807) defines the pure/impure boundary. `verification-architecture.md §2` debounceSchedule.ts row (line 42) describes the shell pattern explicitly. RD-012 (line 715) summarises. PROP-EDIT-003 retains the array-of-timestamps signature for property-test enumeration; production caller supplies a 1-element array. |
| FIND-013 | major | verification_readiness | RESOLVED | `verification-architecture.md §2` editorReducer.ts row (line 41) signature is `(state, action) → { state, commands: ReadonlyArray<EditorCommand> }`. PROP-EDIT-002/007/008/009 (lines 155, 160-162) reference the new signature. RD-010 (line 713) documents. |
| FIND-014 | major | spec_fidelity | RESOLVED | `behavioral-spec.md` REQ-EDIT-016 (line 277) and REQ-EDIT-027 (line 465) specify the successor state for `validation.empty-body-on-idle`: `status === 'editing'`, `isDirty === false`, idle timer cleared. RD-007 (line 710) documents. PROP-EDIT-032 (line 186) carries the integration assertion. |
| FIND-015 | major | verification_readiness | RESOLVED | `verification-architecture.md` PROP-EDIT-015 (line 168) replaced with grep-of-source assertion ("not by jsdom getComputedStyle — jsdom does not reliably resolve scoped Svelte CSS"). PROP-EDIT-035 (line 189) replaced with "DESIGN.md manual review checklist + grep of component source files" — no `audit-design-tokens.ts` script required. |
| FIND-016 | major | spec_fidelity | RESOLVED | `behavioral-spec.md §10 Domain ↔ UI State Synchronization` (line 721) defines outbound dispatch methods and the inbound `editing_session_state_changed` Tauri event channel. `verification-architecture.md §2` adds `editorStateChannel.ts` (line 54). RD-011 (line 714) documents. (Minor structural overlap with `tauriEditorAdapter.ts` raised as FIND-022.) |
| FIND-017 | minor | spec_fidelity | RESOLVED | `behavioral-spec.md §6 Glossary` entry for `Body.isEmptyAfterTrim` (line 658) reads exactly the iter-1 recommended remediation text. |
| FIND-018 | minor | spec_fidelity | RESOLVED | `behavioral-spec.md` NFR-EDIT-002 (line 487) adopts FIND-018 Option A: "`role=alert` implies `aria-live=assertive`... no explicit `aria-live` attribute is required". Acceptance bullet at line 491 matches. |

## Counts

- RESOLVED: 18
- PARTIAL: 0
- OPEN: 0

## New issues introduced in iter-2

| New finding | Severity | Dimension | Summary |
|---|---|---|---|
| FIND-019 | major | verification_readiness | Phase 5 branch-coverage gate names `vitest --coverage` (v8 provider) but `@vitest/coverage-v8` is not in `promptnotes/package.json`. Same class of defect as iter-1 FIND-002. |
| FIND-020 | minor | verification_readiness | PROP-EDIT-002 and PROP-EDIT-009 are near-duplicates of the same source-field-pass-through property under REQ-EDIT-026. |
| FIND-021 | minor | verification_readiness | `EditorCommand` discriminated union is referenced by PROP-EDIT-002/007/009/010 but never enumerated. |
| FIND-022 | minor | verification_readiness | `tauriEditorAdapter.ts` and `editorStateChannel.ts` overlap on inbound `listen(...)` responsibility per `verification-architecture.md §2` lines 52 and 54. |
