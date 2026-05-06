/**
 * clipboardAdapter.ts — clipboard write adapter (effectful shell, Sprint 2)
 *
 * Wraps navigator.clipboard.writeText(text).
 *
 * NOTE: As of Sprint 7 this module is not imported by any editor component.
 * Per verification-architecture.md §2 ("clipboardAdapter.ts: impure legacy"),
 * CopyNoteBody in the block-based contract is fulfilled by Rust (bodyForClipboard
 * server-side); the TS adapter only forwards the IPC. Retained in case a future
 * sprint reintroduces a client-side clipboard write path.
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
