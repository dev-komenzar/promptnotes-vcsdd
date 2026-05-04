---
findingId: FIND-003
severity: critical
dimension: structural_integrity
category: requirement_mismatch
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:307-447
---

# FIND-003: Banner styling violates REQ-EDIT-020 / NFR-EDIT-005..007 / CRIT-013 in every audited dimension

## Spec / contract requirements
behavioral-spec.md REQ-EDIT-020 acceptance criteria:
- Banner container uses the 5-layer Deep Shadow string: `rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`.
- Left accent uses `#dd5b00`.
- Banner `border-radius` is `8px`.
- Retry button: Primary Blue style (`#0075de` background, white text, 4px radius, 8px 16px padding).
- Discard / Cancel: Secondary style (`rgba(0,0,0,0.05)` background, near-black text, 4px radius).
- All button text: `font-size: 15px; font-weight: 600` (Nav/Button typography).

sprint-2.md CRIT-013 pass threshold:
- `grep '5-layer\|rgba(0,0,0,0.05) 0px 23px 52px' src/lib/editor/EditorPane.svelte` returns a hit.
- `grep '#dd5b00' src/lib/editor/` returns a hit in the banner section.
- `grep 'font-size: 15px'` and `grep 'font-weight: 600'` return hits on button styles.

## Observed banner styles in EditorPane.svelte:307-397

| Spec requirement | Observed | Pass? |
|---|---|---|
| 5-layer Deep Shadow on banner | banner has no `box-shadow`; only `.editor-pane` has a 2-layer shadow | FAIL |
| `#dd5b00` left accent on banner | not present anywhere; banner uses `background: #fff7ed; border-bottom: 1px solid #fed7aa` | FAIL |
| Banner `border-radius: 8px` | not set on `.save-failure-banner` | FAIL |
| Retry button `background: #0075de`, white text | observed `background: #ea580c; color: white; border-color: #c2410c` | FAIL |
| Discard / Cancel `background: rgba(0,0,0,0.05)` | observed `background: #f8f8f7; color: #6b7280` | FAIL |
| Buttons `font-size: 15px; font-weight: 600` | observed `font-size: 12px; font-weight: 500` | FAIL |
| Banner radius 8px | not set | FAIL |

## Evidence (verbatim from `EditorPane.svelte`)

```css
.save-failure-banner {
  padding: 12px 16px;
  background: #fff7ed;
  border-bottom: 1px solid #fed7aa;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.banner-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  ...
}

.banner-btn--retry {
  background: #ea580c;
  color: white;
  border-color: #c2410c;
}
```

DESIGN.md §10 token allow-list is also violated: `#fff7ed`, `#fed7aa`, `#ea580c`, `#c2410c`, `#9a3412`, `#f59e0b`, `#16a34a`, `#bbf7d0`, `#f0fdf4`, `#fafaf9`, `#e8e8e4`, `#2d2d2b`, `#4b5563`, `#6b7280`, `#d4d4d0`, `#f0f0ef`, `#f8f8f7` are all hex values that do NOT appear in the DESIGN.md Token Reference (warm neutrals + the Notion palette).

## Why tests pass anyway
There is no automated style-grep test (`save-failure-banner.dom.vitest.ts` and the related design-tokens audit are absent — see FIND-006). CRIT-013's pass threshold ("grep returns a hit") cannot be satisfied by the current source.

## Required remediation
- Rewrite `.save-failure-banner` to include the literal 5-layer Deep Shadow string, `border-radius: 8px`, and a `border-left: 4px solid #dd5b00` (or equivalent pseudo-accent).
- Rewrite `.banner-btn` to `font-size: 15px; font-weight: 600; border-radius: 4px; padding: 8px 16px`.
- Set `.banner-btn--retry` to `background: #0075de; color: white;` and `.banner-btn--discard`/`.banner-btn--cancel` to `background: rgba(0,0,0,0.05); color: #1f1f1f`.
- Add `save-failure-banner.dom.vitest.ts` with a grep-based source assertion (read the file via `fs.readFileSync` in the test) for the literal shadow string and the `#dd5b00` token.
