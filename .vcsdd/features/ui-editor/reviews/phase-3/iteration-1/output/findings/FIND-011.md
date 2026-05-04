---
findingId: FIND-011
severity: major
dimension: edge_case_coverage
category: test_coverage
targets:
  - promptnotes/src/lib/editor/__tests__/dom/EditorPane.new-note.dom.vitest.ts:207-230
---

# FIND-011: Out-of-pane Ctrl+N test is tautological because of `bubbles: false`

## Test source (`EditorPane.new-note.dom.vitest.ts:207-230`)

```ts
test('Ctrl+N on document.body (outside pane) does NOT call dispatchRequestNewNote', () => {
  ...
  // Dispatch on document.body, not on the pane
  const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: false });
  document.body.dispatchEvent(event);
  flushSync();

  expect(adapter.dispatchRequestNewNote).not.toHaveBeenCalled();
  ...
});
```

The event has `bubbles: false`, so even if the listener were globally attached to `document` it would still fire only on `document.body` (the dispatch target). This test cannot distinguish a correct pane-scoped listener from a buggy `document.addEventListener('keydown', ...)` listener — both would fail to fire because the listener at `document` would not see a non-bubbling `keydown` dispatched on `document.body`.

The intent — verifying that the listener is pane-scoped per RD-008 — requires:
- Either dispatching `bubbles: true` on a different element outside the pane (e.g., a fixture sibling node), or
- Stubbing `document.addEventListener` and asserting it is not called with `keydown` during component mount.

## Why this matters
RD-008 / REQ-EDIT-024 normative requirement: "The shortcut does NOT fire when focus is outside the editor pane (e.g., when a settings modal has focus)." If a regression were introduced that re-attached the listener to `document` (which would catch any `keydown` event globally regardless of pane focus), this test would still pass.

This is a test_quality defect: the test asserts on the implementation's incidental behaviour (event-target equality) rather than the spec's behaviour (pane-scoped focus).

## Required remediation
Replace `bubbles: false` with a sibling fixture and `bubbles: true`:

```ts
const sibling = document.createElement('div');
document.body.appendChild(sibling);
const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
sibling.dispatchEvent(event);
flushSync();
expect(adapter.dispatchRequestNewNote).not.toHaveBeenCalled();
```

This forces the test to fail if the listener were attached to `document` instead of `paneRoot`.
