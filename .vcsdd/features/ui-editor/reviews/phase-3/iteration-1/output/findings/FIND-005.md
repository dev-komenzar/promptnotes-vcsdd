---
findingId: FIND-005
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:262
  - promptnotes/src/lib/editor/EditorPane.svelte:269
---

# FIND-005: Banner button labels diverge from REQ-EDIT-018 / REQ-EDIT-019 normative strings

## Spec requirement
behavioral-spec.md REQ-EDIT-018 acceptance criteria:
> "The Discard button is present and labeled "変更を破棄" when status === 'save-failed'."

behavioral-spec.md REQ-EDIT-019 acceptance criteria:
> "The Cancel button is present and labeled "閉じる（このまま編集を続ける）" when status === 'save-failed'."

These strings come verbatim from `docs/domain/ui-fields.md §画面 4`.

## Observed (`EditorPane.svelte`)

```svelte
<button data-testid="discard-session-button" ...>
  破棄
</button>
...
<button data-testid="cancel-switch-button" ...>
  キャンセル
</button>
```

| Spec literal | Observed literal |
|---|---|
| `変更を破棄` | `破棄` |
| `閉じる（このまま編集を続ける）` | `キャンセル` |

## Why tests pass anyway
`EditorPane.save-failed.dom.vitest.ts` only asserts each banner button is *present* and that its click dispatches the matching adapter method. It never asserts the visible label. Because the `data-testid` attributes match (`discard-session-button`, `cancel-switch-button`), the test passes despite the string mismatch.

This is a textbook test-quality defect: the assertion locates the element by stable test id and then verifies behaviour, but never verifies the user-visible content the spec mandates. The spec's REQ-EDIT-018 / REQ-EDIT-019 are testable acceptance criteria that no test currently enforces.

## Required remediation
- Change the `<button>` text to the exact spec strings.
- Add label assertions in `save-failure-banner.dom.vitest.ts` (FIND-004): `expect(discardBtn!.textContent?.trim()).toBe('変更を破棄')` and `expect(cancelBtn!.textContent?.trim()).toBe('閉じる（このまま編集を続ける）')`.
