---
sprint: 3
status: approved
feature: ui-tag-chip
mode: strict
negotiationRound: 1
---

# Sprint 3 Contract — Arrow Key Navigation in Tag Autocomplete

## Scope

Implement REQ-TAG-005 keyboard navigation (ArrowUp/ArrowDown) and EC-021 in the tag chip autocomplete dropdown, which was specified in Phase 1a but not implemented during sprint 1-2.

## Grading Criteria

### CRIT-030 — ArrowDown navigation
ArrowDown moves highlight forward through suggestions (wraps from last to first). Starting from no highlight, ArrowDown highlights the first suggestion.

### CRIT-031 — ArrowUp navigation
ArrowUp moves highlight backward through suggestions (wraps from first to last). Starting from no highlight, ArrowUp highlights the last suggestion.

### CRIT-032 — Enter selects highlighted
When a suggestion is highlighted via arrow keys, Enter selects that suggestion (commits the highlighted tag name, not the typed text).

### CRIT-033 — No regression
Existing keyboard handlers (Escape to close, Enter to commit typed text when no highlight) continue to work.

### CRIT-034 — Highlight reset
Changing input text resets the highlight index to -1 (no highlight).

## Pass Threshold

All 5 criteria must pass. All new and existing tests must pass without regression.
