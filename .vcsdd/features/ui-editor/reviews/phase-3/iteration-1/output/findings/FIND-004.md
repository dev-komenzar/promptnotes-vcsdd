---
findingId: FIND-004
severity: critical
dimension: edge_case_coverage
category: test_coverage
targets:
  - promptnotes/src/lib/editor/__tests__/dom/
---

# FIND-004: Five mandated integration test files are missing — nine PROP-EDIT obligations have no automated coverage

## Spec / contract requirement
verification-architecture.md §5 enumerates eight integration test files. sprint-2.md §4 reproduces this list and pins each PROP-EDIT obligation to a specific file.

## Observed
The directory `promptnotes/src/lib/editor/__tests__/dom/` contains the following Sprint-2 test files:

- `EditorPane.body-input.dom.vitest.ts`
- `EditorPane.idle-save.dom.vitest.ts`
- `EditorPane.blur-save.dom.vitest.ts`
- `EditorPane.save-failed.dom.vitest.ts`
- `EditorPane.copy.dom.vitest.ts`
- `EditorPane.new-note.dom.vitest.ts`
- `EditorPane.state-mirror.dom.vitest.ts`
- `EditorPane.mount.dom.vitest.ts`
- `tauriEditorAdapter.dom.vitest.ts`
- `editorStateChannel.dom.vitest.ts`
- `debounceTimer.dom.vitest.ts`
- `keyboardListener.dom.vitest.ts`
- `clipboardAdapter.dom.vitest.ts`

Five files mandated by verification-architecture.md §5 / sprint-2.md §4 are missing:

1. `editor-panel.dom.vitest.ts` — owns PROP-EDIT-020a, PROP-EDIT-020b, PROP-EDIT-034.
2. `editor-session-state.dom.vitest.ts` — owns PROP-EDIT-037 (EC-EDIT-003), PROP-EDIT-039 (EC-EDIT-005).
3. `save-failure-banner.dom.vitest.ts` — owns PROP-EDIT-015 (REQ-EDIT-020 style grep), PROP-EDIT-038 (EC-EDIT-004).
4. `editor-validation.dom.vitest.ts` — owns PROP-EDIT-032 (REQ-EDIT-027).
5. `editor-accessibility.dom.vitest.ts` — owns PROP-EDIT-033 (NFR-EDIT-001, NFR-EDIT-002).

## Concrete coverage gaps caused by the missing files

| PROP-ID | What is uncovered |
|---|---|
| PROP-EDIT-020a | "TriggerBlurSave fires before request-new-note in editing+dirty" — never asserted |
| PROP-EDIT-020b | "save-failed + Ctrl+N dispatches request-new-note WITHOUT preceding TriggerBlurSave" — never asserted |
| PROP-EDIT-032 | `SaveValidationError.invariant-violated` → `console.error` and no inline UI; `empty-body-on-idle` → no banner — never asserted |
| PROP-EDIT-033 | `tabIndex`, `aria-disabled`, `role`, `aria-label` matrix on all interactive elements — never asserted |
| PROP-EDIT-034 | NFR-EDIT-003/004 single-handle-per-burst spy on `timer.scheduleIdleSave` — never asserted (the injected timer is also bypassed; see FIND-002) |
| PROP-EDIT-037 | EC-EDIT-003: continued typing in save-failed continues to dispatch EditNoteBody; idle timer keeps running — never asserted |
| PROP-EDIT-038 | EC-EDIT-004: Discard while save in flight propagates; UI reflects domain return — never asserted |
| PROP-EDIT-039 | EC-EDIT-005: switching status re-enables textarea on transition back to editing — never asserted |
| PROP-EDIT-015 | REQ-EDIT-020 grep of 5-layer Deep Shadow / `#dd5b00` / 8px radius / 15px-600 typography in component source — never asserted |

## Why this is critical (not minor)
verification-architecture.md §7 Phase 3 gate explicitly states: "All integration-tier tests must pass." A missing test cannot pass; it cannot fail; it provides zero adversarial pressure. Strict mode requires non-trivial coverage of every PROP-EDIT entry. The absence of these files means the implementation defects in FIND-001 and FIND-003 are not detected by the green-phase suite — the 85/85 vitest pass count in `evidence/sprint-2-green-phase.log` is misleading.

## Required remediation
Author all five files per verification-architecture.md §5 patterns. At minimum each file must include the exact PROP-ID assertions enumerated in the table above.
