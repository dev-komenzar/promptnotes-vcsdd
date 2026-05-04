/**
 * clipboardAdapter.dom.vitest.ts — CRIT-012 (clipboard half)
 *
 * Verifies:
 * - write(text) calls navigator.clipboard.writeText(text)
 * - ClipboardAdapter interface is exported as a named export
 *
 * RED phase: write() throws 'not implemented (Red phase)'.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { createClipboardAdapter } from '../../clipboardAdapter.js';
import type { ClipboardAdapter } from '../../clipboardAdapter.js';

describe('ClipboardAdapter — CRIT-012', () => {
  let adapter: ClipboardAdapter;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    // Stub navigator.clipboard in jsdom (it doesn't exist by default)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    adapter = createClipboardAdapter();
  });

  test('write(text) calls navigator.clipboard.writeText(text)', async () => {
    await adapter.write('hello clipboard');
    expect(writeTextMock).toHaveBeenCalledOnce();
    expect(writeTextMock).toHaveBeenCalledWith('hello clipboard');
  });

  test('write(empty string) calls navigator.clipboard.writeText with empty string', async () => {
    await adapter.write('');
    expect(writeTextMock).toHaveBeenCalledWith('');
  });

  test('write returns a Promise that resolves', async () => {
    await expect(adapter.write('test')).resolves.toBeUndefined();
  });

  test('ClipboardAdapter interface is a named export (type-level check)', () => {
    // If ClipboardAdapter is not exported, this file fails to compile.
    const _typeCheck: ClipboardAdapter = adapter;
    void _typeCheck;
    expect(true).toBe(true);
  });
});
