---
id: FIND-406
severity: medium
dimension: implementation_correctness
category: implementation_bug
relatedReqs: [REQ-016]
relatedCrits: [CRIT-004]
routeToPhase: 2b
---

# FIND-406 — Focus trap is incomplete: no initial focus set on modal open, no return-focus on close

## Citation
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:99-108` — modal `<div>` has `tabindex="-1"` but no `onMount` / `$effect` that programmatically focuses anything when it opens.
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:58-87` — `handleKeydown` Tab logic only acts when `document.activeElement === firstEl` or `=== lastEl`. If focus is anywhere else (e.g., outside the modal entirely, or on the modal `<div>` itself with `tabindex="-1"`), neither branch fires, so Tab can move focus out of the modal naturally.
- `behavioral-spec.md` REQ-016 line 408 — "モーダルが閉じた後: フォーカスをトリガー要素（または `<body>`）に戻す" (no return-focus implementation present)
- `behavioral-spec.md` NFR-03 — "キーボードアクセシビリティ — モーダルはフォーカストラップ + Esc 無効"

## Description
The Tab/Shift+Tab handler implements a wrap-around between first and last focusable elements, but a true focus trap requires:
1. **On open**: programmatically move focus into the modal (e.g., the first focusable element, or the modal `<div>` with tabindex="-1").
2. **On Tab**: prevent focus from leaving the modal even if the current activeElement is OUTSIDE the modal entirely.
3. **On close**: restore focus to the element that triggered the modal.

The current implementation only handles case (2) when activeElement happens to equal first/last focusable — a narrow subset. If focus is on the `<header>` PromptNotes title (which the FIND-209 fix made `inert`, so that's mitigated for keyboard but not for screen-reader virtual cursor), or on the modal container itself, Tab moves to the input naturally. But more importantly, when the modal first opens, focus is wherever it was — typically on `<body>`. The first Tab press will move into the modal (correct), but a screen-reader user may not realize the modal exists if focus didn't move there on open.

Cases (1) and (3) are completely missing. CRIT-004 passThreshold says "Tab/Shift+Tab keyboard handlers present; Esc preventDefault + stopPropagation present" — the handlers ARE present, but the trap is not closed. The contract pass threshold is too narrow; it does not require initial focus, focus-on-document fallback, or return-focus.

With `inert` applied to `<header>` and `<main>` (FIND-209 fix), the trap is partially compensated by browser behavior — `inert` removes elements from the tab order. But `inert` does not restore focus on close.

## Suggested remediation
- Add `onMount` (or Svelte 5 `$effect`) in `VaultSetupModal.svelte` that focuses the first focusable element (or the modal container itself) on open.
- Capture `document.activeElement` as `triggerEl` on open, restore via `triggerEl.focus()` when the modal unmounts or `state` transitions to `Configured`.
- Make the Tab handler unconditionally `event.preventDefault()` + cycle focus when activeElement is outside the modal (defensive).
- Add a test: open modal, assert focus is inside; tab N times, assert focus stays inside; close modal, assert focus returns to trigger.
