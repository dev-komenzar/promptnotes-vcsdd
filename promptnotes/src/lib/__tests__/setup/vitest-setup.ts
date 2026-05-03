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

// 各テスト後にモックをリセット（appShellStore / bootFlag は __resetForTesting__ で
// テスト側からリセットする想定だが、念のため timers / mocks も clear）
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
});
