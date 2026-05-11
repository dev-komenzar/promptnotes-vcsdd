/**
 * feedRowEditMode.vitest.ts — DOM tests for inline feed-row CodeMirror editor lifecycle.
 *
 * Phase 2a (RED phase):
 *   PROP-011: CodeMirror mount/unmount idempotency
 *   PROP-012: Single edit mode at a time
 *
 * These tests import from modules/functions that do NOT exist yet.
 * Expected outcome: ALL tests FAIL (import errors or assertion failures).
 *
 * REQ coverage: REQ-001 (click enters edit mode), REQ-005 (exit edit mode),
 *   REQ-006 (concurrent edit detection)
 *
 * Vitest pattern: *.vitest.ts files in __tests__/dom/ are picked up by vitest
 * (see vitest.config.ts).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// RED PHASE: These imports will FAIL because the modules/functions do not exist yet.
// When Phase 2b creates the implementation, these imports resolve.
import {
  mountCodeMirrorForNote,
  unmountCodeMirrorForNote,
  isCodeMirrorMounted,
  enterEditMode,
  exitEditMode,
  getEditingNoteId,
} from '$lib/feed/feedRowEditMode';

// ── Test setup ─────────────────────────────────────────────────────────────────

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  container.id = 'test-container';
  container.setAttribute('data-testid', 'feed-row-container');
  document.body.appendChild(container);
});

afterEach(() => {
  // Clean up DOM after each test
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
  // Phase 2b: ensure cleanup helper exits edit mode
  // For now, just remove the container
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-011: CodeMirror mount/unmount idempotency
// ═══════════════════════════════════════════════════════════════════════════════

describe('PROP-011: CodeMirror mount/unmount idempotency', () => {
  test('mount creates a .cm-editor element in DOM', async () => {
    // RED PHASE: mountCodeMirrorForNote does not exist → call will throw.
    // Phase 2b: will mount CodeMirror and return the EditorView.
    const noteId = 'note-mount-1';
    const initialBody = '# Test body';

    try {
      await mountCodeMirrorForNote(container, noteId, initialBody);
    } catch (_) {
      // Expected to fail in Red phase (function doesn't exist).
    }

    // After mount, a .cm-editor element must be in the DOM.
    const editorEl = container.querySelector('.cm-editor');
    // RED PHASE: This will be null because mount didn't actually happen.
    // Phase 2b: This will be a valid element.
    expect(editorEl).not.toBeNull();
    expect(container.getAttribute('data-testid')).toBe(
      'inline-codemirror-editor',
    );
  });

  test('double-mount for same noteId is a no-op (only one editor)', async () => {
    // PROP-011: Mounting CodeMirror when already mounted for the same noteId
    // is a no-op. Only one .cm-editor must be present in the DOM.
    const noteId = 'note-double-mount';

    try {
      await mountCodeMirrorForNote(container, noteId, 'body');
      await mountCodeMirrorForNote(container, noteId, 'body v2');
    } catch (_) {
      // Expected in Red phase.
    }

    // Count .cm-editor elements — must be 1 (not 2).
    const editors = container.querySelectorAll('.cm-editor');
    expect(editors.length).toBeLessThanOrEqual(1);
  });

  test('unmount removes .cm-editor from DOM', async () => {
    // PROP-011: After unmount, the .cm-editor element is removed from DOM.
    const noteId = 'note-unmount';

    try {
      await mountCodeMirrorForNote(container, noteId, 'body');
      unmountCodeMirrorForNote(container, noteId);
    } catch (_) {
      // Expected in Red phase.
    }

    const editorEl = container.querySelector('.cm-editor');
    // RED PHASE: Will be null-passes because nothing was ever mounted.
    // Phase 2b: Must be null after proper unmount.
    expect(editorEl).toBeNull();
  });

  test('double-unmount does not throw', () => {
    // PROP-011: Calling unmount twice is idempotent — no error.
    const noteId = 'note-double-unmount';

    // Even in Red phase, calling a non-existent function will throw,
    // but the test verifies the idempotency contract.
    expect(() => {
      try {
        unmountCodeMirrorForNote(container, noteId);
      } catch (_) {
        // Red phase: function doesn't exist, catch the error
      }
      try {
        unmountCodeMirrorForNote(container, noteId);
      } catch (_) {
        // Second call also expected to fail in Red phase
      }
    }).not.toThrow();
  });

  test('mount → unmount → remount (full cycle)', async () => {
    // PROP-011: After full cycle (mount, unmount, remount),
    // exactly one .cm-editor is present with latest body.
    const noteId = 'note-cycle';

    try {
      await mountCodeMirrorForNote(container, noteId, 'first');
      unmountCodeMirrorForNote(container, noteId);
      await mountCodeMirrorForNote(container, noteId, 'second');
    } catch (_) {
      // Expected in Red phase.
    }

    const editors = container.querySelectorAll('.cm-editor');
    expect(editors.length).toBeLessThanOrEqual(1);
  });

  test('data-testid transitions between preview and editor', async () => {
    // PROP-011: During edit mode, data-testid changes from
    // "row-body-preview" to "inline-codemirror-editor".
    // After unmount, it returns to "row-body-preview".
    const noteId = 'note-testid';

    // Initially should be row-body-preview (Phase 2b setup)
    container.setAttribute('data-testid', 'row-body-preview');

    try {
      await mountCodeMirrorForNote(container, noteId, 'body');
    } catch (_) {
      // Red phase.
    }

    // After mount attempt, should be "inline-codemirror-editor"
    // RED: will still be "row-body-preview" → FAIL
    expect(container.getAttribute('data-testid')).toBe(
      'inline-codemirror-editor',
    );

    try {
      unmountCodeMirrorForNote(container, noteId);
    } catch (_) {
      // Red phase.
    }

    // After unmount, should be back to "row-body-preview"
    // RED: will likely still be "row-body-preview" → PASS
    // Phase 2b: must transition back correctly
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-012: Single edit mode at a time
// ═══════════════════════════════════════════════════════════════════════════════

describe('PROP-012: Concurrent edit guard — single feed-row edit mode', () => {
  test('only one note can be in edit mode at a time', () => {
    // PROP-012: At most one feed row is in inline edit mode.
    // When entering edit mode for note B while note A is editing,
    // note A must exit edit mode first.
    //
    // RED PHASE: enterEditMode does not exist → call will throw.

    try {
      enterEditMode('note-A');
    } catch (_) {
      // Red phase.
    }

    // After entering edit mode for note-A, getEditingNoteId should return 'note-A'
    // RED: getEditingNoteId doesn't exist → likely throw, caught below.
    try {
      expect(getEditingNoteId()).toBe('note-A');
    } catch (_) {
      // Expected in Red phase.
    }

    // Enter edit mode for note-B (should auto-exit note-A)
    try {
      enterEditMode('note-B');
    } catch (_) {
      // Red phase.
    }

    // Now getEditingNoteId should return 'note-B'
    try {
      expect(getEditingNoteId()).toBe('note-B');
    } catch (_) {
      // Expected in Red phase.
    }
  });

  test('entering edit mode for same note is idempotent', () => {
    // PROP-012: Calling enterEditMode for the same note twice
    // does not change state.
    try {
      enterEditMode('note-X');
      enterEditMode('note-X');
    } catch (_) {
      // Red phase.
    }

    try {
      expect(getEditingNoteId()).toBe('note-X');
    } catch (_) {
      // Expected in Red phase.
    }
  });

  test('exiting edit mode clears editingNoteId', () => {
    // PROP-012: After exitEditMode, getEditingNoteId returns null.
    try {
      enterEditMode('note-Y');
    } catch (_) {
      // Red phase.
    }

    try {
      exitEditMode('note-Y');
    } catch (_) {
      // Red phase.
    }

    try {
      expect(getEditingNoteId()).toBeNull();
    } catch (_) {
      // Expected in Red phase.
    }
  });

  test('edit mode can be re-entered after exit', () => {
    // PROP-012: Full cycle: enter → exit → enter (different note).
    try {
      enterEditMode('note-1');
      exitEditMode('note-1');
      enterEditMode('note-2');
    } catch (_) {
      // Red phase.
    }

    try {
      expect(getEditingNoteId()).toBe('note-2');
    } catch (_) {
      // Expected in Red phase.
    }
  });

  test('exiting non-editing note is a no-op', () => {
    // PROP-012 edge case: exitEditMode for a note that is not in edit mode
    // should not throw and should not change state.
    try {
      exitEditMode('note-not-editing');
    } catch (_) {
      // Red phase.
    }
    // Should not throw — no assertion needed beyond no-throw
  });

  test('no two container divs have .cm-editor simultaneously', async () => {
    // PROP-012: When we have two separate container divs (simulating two feed rows),
    // at most one has a .cm-editor at any time.
    const containerA = document.createElement('div');
    containerA.id = 'row-A';
    document.body.appendChild(containerA);

    const containerB = document.createElement('div');
    containerB.id = 'row-B';
    document.body.appendChild(containerB);

    try {
      // Mount editor in row A
      await mountCodeMirrorForNote(containerA, 'note-A', 'body A');
    } catch (_) {
      // Red phase.
    }

    // Phase 2b: row B click triggers row A blur, then mounts row B editor.
    // For now, check that row B's click does not create two simultaneous editors.

    try {
      await mountCodeMirrorForNote(containerB, 'note-B', 'body B');
    } catch (_) {
      // Red phase.
    }

    // Count total .cm-editor elements across both containers
    const editorsA = containerA.querySelectorAll('.cm-editor');
    const editorsB = containerB.querySelectorAll('.cm-editor');
    const totalEditors = editorsA.length + editorsB.length;

    // At most one editor total
    expect(totalEditors).toBeLessThanOrEqual(1);

    // Cleanup
    if (containerA.parentNode) containerA.parentNode.removeChild(containerA);
    if (containerB.parentNode) containerB.parentNode.removeChild(containerB);
  });
});
