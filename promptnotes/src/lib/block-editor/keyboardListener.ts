/**
 * keyboardListener.ts — pane-scoped keyboard shortcut listener (effectful shell)
 *
 * Attaches a keydown listener to a host root element (NOT document).
 * Detects (ctrlKey || metaKey) && key.toLowerCase() === 'n'.
 *
 * Reserved for future Ctrl+N new-note dispatch (BlockEditorAdapter's
 * dispatchRequestNewNote pathway). Per EC-BE-013, this module is currently
 * unused; the corresponding ui-block-editor primitive does not import it as
 * of Sprint 4. CI grep gate (FIND-BE-3-012) verifies zero importers.
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
