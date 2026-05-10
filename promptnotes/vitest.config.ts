import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

// Svelte 5 公式推奨: vitest + jsdom + svelte preprocess。
// https://svelte.dev/docs/svelte/testing
export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      $lib: resolve(__dirname, "src/lib"),
      $app: resolve(__dirname, "node_modules/@sveltejs/kit/src/runtime/app"),
    },
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
    globals: false,
    // bun:test との衝突を避けるため `.vitest.ts` 拡張子のみ vitest で実行する。
    // bun:test は `*.test.ts` / `*.spec.ts` を auto-discover するため、
    // `.vitest.ts` は bun の検索範囲外。
    include: [
      "src/lib/**/__tests__/dom/**/*.vitest.ts",
      // Sprint 6: DOM-backed property tests live in __tests__/dom/ and require
      // jsdom; they use .property.test.ts suffix to distinguish from bun:test
      // pure property tests while still being picked up by vitest.
      "src/lib/**/__tests__/dom/**/*.property.test.ts",
      "src/routes/__tests__/**/*.vitest.ts",
    ],
    setupFiles: ["./src/lib/__tests__/setup/vitest-setup.ts"],
  },
});
