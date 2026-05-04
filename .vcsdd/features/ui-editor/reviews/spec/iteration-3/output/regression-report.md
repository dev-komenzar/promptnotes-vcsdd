---
review_iteration: 3
feature: ui-editor
phase: 1c
mode: strict
generated_at: 2026-05-04T00:00:00Z
---

# Iter-2 Findings — Regression Status

| ID | Severity | Category | Status | Evidence |
|---|---|---|---|---|
| FIND-019 | major | verification_tool_mismatch | RESOLVED | `promptnotes/package.json` line 27 records `"@vitest/coverage-v8": "^4.1.5"`. `verification-architecture.md §3 Tier 3` (line 95) cites the package by name. Phase 2 entry criterion at line 97 enforces presence in `bun.lock`. §5 (line 247) and §7 Phase 5 gate (line 344) consistently reference the same package. |
| FIND-020 | minor | test_quality (PROP duplication) | RESOLVED | `RD-015` in `behavioral-spec.md §9` (line 718) demotes PROP-EDIT-009 to a corollary subsumed by PROP-EDIT-002. `verification-architecture.md` PROP-EDIT-009 (line 169) is reworded as "subsumed by PROP-EDIT-002 — no separate test required" with `Required: false` in the tier table (line 89). Coverage Matrix REQ-EDIT-026 row (line 305) cites "PROP-EDIT-002 (required); PROP-EDIT-009 subsumed". Note: builder picked PROP-EDIT-002 as canonical (opposite of FIND-020's recommendation to keep PROP-EDIT-009), but the dedup is consistent and acceptable. |
| FIND-021 | minor | spec_gap (EditorCommand union) | RESOLVED with caveat | `verification-architecture.md §10` (lines 394-435) defines the canonical 9-variant `EditorCommand` discriminated union. `RD-017` (line 720) documents it. PROP-EDIT-007 (line 87, 167) and PROP-EDIT-010 (line 170) cite the union by name; PROP-EDIT-010 cites `'cancel-idle-timer'` literally. Tier 0 exhaustive-switch obligation in §10 (line 425) is added. **Caveat**: the union itself has a new payload-completeness gap — see FIND-023. |
| FIND-022 | minor | spec_gap (adapter responsibility) | RESOLVED | `verification-architecture.md §2` line 52 (`tauriEditorAdapter.ts`: "OUTBOUND only ... Does NOT call `@tauri-apps/api/event listen(...)`") and line 54 (`editorStateChannel.ts`: "INBOUND only ... Does NOT call `invoke(...)`"). `RD-016` (line 719) documents the clean split. `behavioral-spec.md §8 Threat Model` (line 369) clarifies "These two modules do NOT overlap". Phase 5 audit greps are explicitly mapped to which module each pattern should appear in. |

# Summary

- Iter-2 findings resolved: 4 / 4
- Iter-2 findings partial: 0
- Iter-2 findings open: 0
- New findings introduced in iter-3: 2 (both minor)
  - FIND-023 — `EditorCommand` union missing `noteId` (and `issuedAt`) for `'edit-note-body'` and `'copy-note-body'` variants. Introduced by the FIND-021 remediation edit.
  - FIND-024 — `computeNextFireAt` signature disagrees between `verification-architecture.md §2` (4 fields including `nowMs`) and `behavioral-spec.md §12` (3 fields; `now` referenced in prose only). Pre-existing but surfaced by the FIND-012 remediation lineage.

# Verdict thresholds reminder

- Dimension PASSES iff zero critical AND zero major findings.
- Iter-3 finding severities: 0 critical, 0 major, 2 minor.
- Both dimensions PASS.
- Overall verdict: **PASS**.
