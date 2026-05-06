/**
 * vitest setup — Tauri runtime を JSDOM 上で stub し、@tauri-apps/api/core の
 * `invoke` を vi.mock 経由で差し替えできるようにする。
 *
 * 各 DOM テストは vi.mock("@tauri-apps/api/core", ...) でコマンド別レスポンスを定義する。
 */

import { afterEach, vi } from "vitest";

// Svelte が `window.matchMedia` を参照する場合の最低限 stub
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom に DragEvent が存在しないため最低限の polyfill を注入する
// REQ-EDIT-011 (block-drag-handle.dom.vitest.ts) が DragEvent を使用するため必要。
if (typeof window !== "undefined" && typeof (window as any).DragEvent === "undefined") {
  class DataTransferPolyfill {
    private _data: Map<string, string> = new Map();
    effectAllowed: string = 'uninitialized';
    dropEffect: string = 'none';
    setData(format: string, data: string): void { this._data.set(format, data); }
    getData(format: string): string { return this._data.get(format) ?? ''; }
    clearData(format?: string): void {
      if (format) this._data.delete(format);
      else this._data.clear();
    }
  }

  class DragEventPolyfill extends MouseEvent {
    readonly dataTransfer: DataTransferPolyfill;
    constructor(type: string, init?: MouseEventInit & { dataTransfer?: DataTransferPolyfill }) {
      super(type, init);
      this.dataTransfer = init?.dataTransfer ?? new DataTransferPolyfill();
    }
  }

  Object.defineProperty(window, 'DragEvent', {
    writable: true,
    configurable: true,
    value: DragEventPolyfill,
  });
}

// 各テスト後にモックをリセット（appShellStore / bootFlag は __resetForTesting__ で
// テスト側からリセットする想定だが、念のため timers / mocks も clear）
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
});
