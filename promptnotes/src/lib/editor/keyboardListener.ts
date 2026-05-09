/**
 * keyboardListener.ts — pane-scoped keyboard shortcut listener (effectful shell, Sprint 2)
 *
 * Attaches a keydown listener to the editor pane root element (NOT document).
 * Detects (ctrlKey || metaKey) && key.toLowerCase() === 'n'.
 *
 * NOTE: As of Sprint 7 this module is not imported by EditorPanel.svelte.
 * The equivalent logic is inlined in EditorPanel's $effect keyboard handler
 * (which also handles Alt+Shift+Arrow reorder). Retained for potential extraction
 * if the keyboard-shortcut surface grows beyond what fits in an $effect block.
 * REQ-EDIT-035 (Ctrl+N new-note), REQ-EDIT-036 (block reorder keyboard fallback).
 */

export function attachKeyboardListener(
  panelRoot: HTMLElement,
  onNewNote: (source: 'ctrl-N') => void
): () => void {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      onNewNote('ctrl-N');
    }
  };

  panelRoot.addEventListener('keydown', handler);

  return () => {
    panelRoot.removeEventListener('keydown', handler);
  };
}
