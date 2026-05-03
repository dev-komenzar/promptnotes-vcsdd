---
id: FIND-204
severity: major
dimension: implementation_correctness
category: requirement_mismatch
relatedReqs: [REQ-016]
relatedCrits: [CRIT-011]
routeToPhase: 2b
---

# FIND-204 — Modal focus trap (Tab cycling) is not implemented

## Citation
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:36-42` — `handleKeydown` only intercepts `Escape`; no handling for `Tab` / `Shift+Tab`
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:53-62` — modal container has `tabindex="-1"` but no JS-managed focus cycling logic
- `promptnotes/src/lib/ui/app-shell/__tests__/vault-modal.test.ts` — no test covers Tab key cycling behavior; only `isModalCloseable(state, trigger)` pure-function assertions

## Description
REQ-016 AC: "Tab キー: モーダル内の最後の focusable 要素から最初の focusable 要素へループする"; "Shift+Tab: 逆方向ループ"; "フォーカストラップは `FocusTrap` ユーティリティまたは同等の実装で管理される".

The implementation:
1. Has zero code that intercepts Tab. The browser's native tab order will simply walk past the modal's last focusable element to whatever is next in document order (which, because `AppShell.svelte` does not put the underlying app content in `inert`, is the body content behind the overlay).
2. REQ-003 also requires the background DOM to be `aria-hidden="true"` + `inert`. Neither attribute is applied to the `Configured` slot or the header.
3. Contract CRIT-011 passThreshold says "vault-modal.test.ts role/aria-modal/tabindex assertions pass 100%". The role/aria/tabindex attributes are present, but the focus-trap *behavior* is the load-bearing requirement and is unverified and unimplemented.

PROP-005 fast-check covers only the `isModalCloseable` boolean — that does not exercise focus management at all.

## Suggested remediation
- Implement a Tab/Shift+Tab handler that cycles focus among the modal's focusable descendants (or import a small focus-trap utility).
- Apply `inert` and `aria-hidden="true"` to the background frame while the modal is open.
- Add tests (likely with `@testing-library/svelte` + user-event) that assert Tab cycling stays within the dialog.
