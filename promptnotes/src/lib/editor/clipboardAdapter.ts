/**
 * clipboardAdapter.ts — clipboard write adapter (effectful shell, Sprint 2)
 *
 * Wraps navigator.clipboard.writeText(text).
 */

export interface ClipboardAdapter {
  write(text: string): Promise<void>;
}

export function createClipboardAdapter(): ClipboardAdapter {
  return {
    write(text: string): Promise<void> {
      return navigator.clipboard.writeText(text);
    },
  };
}
