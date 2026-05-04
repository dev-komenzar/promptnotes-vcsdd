/**
 * keyboardListener.ts — pane-scoped keyboard shortcut listener (effectful shell, Sprint 2)
 *
 * Attaches a keydown listener to the editor pane root element (NOT document).
 * Detects (ctrlKey || metaKey) && key.toLowerCase() === 'n'.
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
