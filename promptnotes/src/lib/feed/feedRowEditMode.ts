/**
 * feedRowEditMode.ts — Inline CodeMirror editor lifecycle management for FeedRow.
 *
 * Pure: validate_no_control_chars
 * Impure: mount/unmount CodeMirror, local edit-mode state
 *
 * Single-instance enforcement: at most one CodeMirror editor exists at any time.
 * Mounting a new editor destroys any existing editor first.
 *
 * REQ-001, REQ-003, REQ-005, REQ-006
 */

import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

let currentEditingNoteId: string | null = null;
let currentEditorView: EditorView | null = null;
let currentEditorContainer: HTMLElement | null = null;

const stateListeners = new Set<() => void>();

function notifyStateChanged(): void {
  for (const fn of stateListeners) {
    fn();
  }
}

export function subscribeToEditState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

const DISALLOWED_RANGES: ReadonlyArray<[number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
];
const DISALLOWED_DELETE = 0x7f;

/**
 * REQ-003: Frontend control-character pre-filter.
 * Rejects U+0000–U+001F (except TAB U+0009, LF U+000A, CR U+000D)
 * and U+007F (DELETE). TAB, LF, CR are permitted.
 *
 * Pure function — no side effects, no DOM access.
 * PROP-009
 */
export function validate_no_control_chars(
  body: string,
): { ok: true } | { ok: false; error: string } {
  for (let i = 0; i < body.length; i++) {
    const cp = body.codePointAt(i);
    if (cp === undefined) continue;

    if (cp === DISALLOWED_DELETE) {
      return {
        ok: false,
        error: `Control character U+${cp.toString(16).padStart(4, '0').toUpperCase()} at position ${i}`,
      };
    }

    for (const [lo, hi] of DISALLOWED_RANGES) {
      if (cp >= lo && cp <= hi) {
        return {
          ok: false,
          error: `Control character U+${cp.toString(16).padStart(4, '0').toUpperCase()} at position ${i}`,
        };
      }
    }

    if (cp > 0xffff) i++;
  }
  return { ok: true };
}

export interface CodeMirrorCallbacks {
  onChange?: (body: string) => void;
  onBlur?: () => void;
  onEscape?: () => void;
}

/**
 * REQ-001: Mount a CodeMirror EditorView in the given container.
 * Single-instance: destroys any existing editor before creating a new one.
 * Idempotent: mounting the same noteId in the same container is a no-op.
 *
 * PROP-011
 */
export async function mountCodeMirrorForNote(
  container: HTMLElement,
  noteId: string,
  initialBody: string,
  callbacks?: CodeMirrorCallbacks,
): Promise<void> {
  if (
    currentEditingNoteId === noteId &&
    currentEditorContainer === container &&
    currentEditorView
  ) {
    return;
  }

  if (currentEditorView) {
    try {
      currentEditorView.destroy();
    } catch (e) {
      console.error('[feedRowEditMode] Error destroying previous CodeMirror editor:', e);
    }
    currentEditorView = null;
    if (currentEditorContainer) {
      currentEditorContainer.setAttribute('data-testid', 'row-body-preview');
      currentEditorContainer = null;
    }
    currentEditingNoteId = null;
  }

  const view = new EditorView({
    doc: initialBody,
    extensions: [
      markdown(),
      keymap.of([
        {
          key: 'Escape',
          run: () => {
            callbacks?.onEscape?.();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          callbacks?.onChange?.(update.state.sliceDoc());
        }
      }),
    ],
    parent: container,
  });

  view.dom.addEventListener(
    'blur',
    () => {
      setTimeout(() => {
        if (currentEditorView === view) {
          callbacks?.onBlur?.();
        }
      }, 0);
    },
    { once: false },
  );

  container.setAttribute('data-testid', 'inline-codemirror-editor');
  currentEditorView = view;
  currentEditorContainer = container;
  currentEditingNoteId = noteId;
  notifyStateChanged();

  view.focus();
}

/**
 * REQ-005: Destroy the CodeMirror EditorView and restore the preview state.
 * Safe to call for a note/container that is not currently editing (no-op).
 *
 * PROP-011
 */
export function unmountCodeMirrorForNote(
  container: HTMLElement,
  noteId: string,
): void {
  if (currentEditorContainer === container && currentEditorView) {
    try {
      currentEditorView.destroy();
    } catch (e) {
      console.error('[feedRowEditMode] Error destroying CodeMirror editor:', e);
    }
    currentEditorView = null;
    currentEditorContainer = null;
    currentEditingNoteId = null;
    container.setAttribute('data-testid', 'row-body-preview');
    notifyStateChanged();
  }
}

/**
 * Returns true if a .cm-editor element exists in the given container.
 * PROP-011
 */
export function isCodeMirrorMounted(container: HTMLElement): boolean {
  return container.querySelector('.cm-editor') !== null;
}

/**
 * Sets the currently-editing noteId for inline edit mode.
 * Only one note can be in edit mode at a time.
 *
 * PROP-012
 */
export function enterEditMode(noteId: string): void {
  currentEditingNoteId = noteId;
  notifyStateChanged();
}

/**
 * Clears the editing noteId if it matches the given noteId.
 * Safe to call for a note that is not currently editing (no-op).
 *
 * PROP-012
 */
export function exitEditMode(noteId: string): void {
  if (currentEditingNoteId === noteId) {
    currentEditingNoteId = null;
    notifyStateChanged();
  }
}

/**
 * Returns the currently-editing noteId, or null if no note is in edit mode.
 * PROP-012
 */
export function getEditingNoteId(): string | null {
  return currentEditingNoteId;
}

export function getCurrentEditorBody(): string {
  return currentEditorView?.state.sliceDoc() ?? '';
}
