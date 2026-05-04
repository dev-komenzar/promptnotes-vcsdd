/**
 * keyboardListener.dom.vitest.ts — CRIT-012 (keyboard half)
 *
 * Verifies:
 * - attachKeyboardListener registers on panelRoot (NOT document)
 * - Ctrl+N on pane fires onNewNote('ctrl-N') and calls preventDefault
 * - Cmd+N (metaKey) on pane fires onNewNote('ctrl-N') and calls preventDefault
 * - Ctrl+N dispatched on document.body (outside pane) does NOT fire
 * - The returned cleanup removes the listener
 *
 * RED phase: attachKeyboardListener throws 'not implemented (Red phase)'.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { attachKeyboardListener } from '../../keyboardListener.js';

describe('keyboardListener — CRIT-012', () => {
  let panelRoot: HTMLDivElement;

  beforeEach(() => {
    panelRoot = document.createElement('div');
    document.body.appendChild(panelRoot);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('Ctrl+N on panelRoot fires onNewNote("ctrl-N")', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    panelRoot.dispatchEvent(event);

    expect(onNewNote).toHaveBeenCalledOnce();
    expect(onNewNote).toHaveBeenCalledWith('ctrl-N');
    cleanup();
  });

  test('Cmd+N (metaKey) on panelRoot fires onNewNote("ctrl-N")', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);

    const event = new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true });
    panelRoot.dispatchEvent(event);

    expect(onNewNote).toHaveBeenCalledOnce();
    expect(onNewNote).toHaveBeenCalledWith('ctrl-N');
    cleanup();
  });

  test('Ctrl+N calls event.preventDefault()', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    panelRoot.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    cleanup();
  });

  test('Ctrl+N dispatched on document.body (outside pane) does NOT fire', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);

    // Dispatch on document.body, not on panelRoot
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: false });
    document.body.dispatchEvent(event);

    expect(onNewNote).not.toHaveBeenCalled();
    cleanup();
  });

  test('non-N key with ctrlKey does NOT fire', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
    panelRoot.dispatchEvent(event);

    expect(onNewNote).not.toHaveBeenCalled();
    cleanup();
  });

  test('cleanup removes the listener: Ctrl+N after cleanup does not fire', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);
    cleanup();

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    panelRoot.dispatchEvent(event);

    expect(onNewNote).not.toHaveBeenCalled();
  });

  test('uppercase N with ctrlKey also fires (case-insensitive match)', () => {
    const onNewNote = vi.fn();
    const cleanup = attachKeyboardListener(panelRoot, onNewNote);

    const event = new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, bubbles: true });
    panelRoot.dispatchEvent(event);

    expect(onNewNote).toHaveBeenCalledOnce();
    cleanup();
  });
});
