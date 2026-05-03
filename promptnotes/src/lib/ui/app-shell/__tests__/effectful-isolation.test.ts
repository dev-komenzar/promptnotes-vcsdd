/**
 * effectful-isolation.test.ts — REQ-021, PROP-011, PROP-012
 *
 * REQ-021: EFFECTFUL シングルトンの書き込み権限とHMRリセット
 *   - appShellStore.set() / .update() は AppShell.svelte と VaultSetupModal.svelte のみ
 *   - bootFlag は export されない（外部モジュールから参照不能）
 *   - HMR 後の再マウント時に bootFlag が false に戻り、invoke_app_startup が再実行される
 *
 * PROP-011: appShellStore の書き込み面が隔離されている (Tier 0 ESLint audit)
 *   This test is a static-analysis-style audit: scans source files for appShellStore.set(
 *   or appShellStore.update( calls outside the two allowed files.
 *   Will FAIL because source files don't exist yet — that's the Red signal for this audit.
 *
 * PROP-012: bootFlag はモジュールスコープで宣言され HMR 後にリセットされる
 *   Tier 1: module re-import verification
 *
 * EC-20: HMR 中に try_vault_path IPC が in-flight
 *   → HMR により bootFlag リセット → next mount invokes invoke_app_startup again
 *
 * RED PHASE: imports below MUST fail — modules do not exist yet.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// RED PHASE: These imports MUST FAIL — modules do not exist yet.
import {
  appShellStore,
  type AppShellState,
} from "$lib/ui/app-shell/appShellStore";

import {
  getBootAttempted,
} from "$lib/ui/app-shell/bootOrchestrator";

// ── PROP-011: appShellStore write isolation (static analysis audit) ───────────

describe("PROP-011: appShellStore write isolation — source file audit", () => {
  const UI_APP_SHELL_DIR = path.resolve(
    process.cwd(),
    "src/lib/ui/app-shell"
  );

  const ALLOWED_WRITERS = new Set([
    path.join(UI_APP_SHELL_DIR, "AppShell.svelte"),
    path.join(UI_APP_SHELL_DIR, "VaultSetupModal.svelte"),
  ]);

  function findAppShellStoreWrites(dir: string): string[] {
    const violations: string[] = [];
    if (!fs.existsSync(dir)) {
      // If source dir doesn't exist yet, fail with a descriptive message
      throw new Error(
        `PROP-011 audit: source directory ${dir} does not exist yet. ` +
        "This is the expected RED state — create the production modules to proceed."
      );
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith("__")) {
        violations.push(...findAppShellStoreWrites(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte"))) {
        if (ALLOWED_WRITERS.has(fullPath)) continue;
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("appShellStore.set(") || content.includes("appShellStore.update(")) {
          violations.push(fullPath);
        }
      }
    }
    return violations;
  }

  test("PROP-011: no file outside AppShell.svelte / VaultSetupModal.svelte writes to appShellStore", () => {
    // This test will FAIL if source dir doesn't exist (RED phase — expected)
    // OR if violations are found (BUG — fix required)
    const violations = findAppShellStoreWrites(UI_APP_SHELL_DIR);
    expect(violations).toEqual([]);
  });
});

// ── PROP-012: bootFlag is not exported ───────────────────────────────────────

describe("PROP-012: bootFlag is not exported from bootOrchestrator", () => {
  test("bootOrchestrator module does NOT export 'bootFlag' as a symbol", async () => {
    // RED PHASE: import fails because module doesn't exist
    const mod = await import("$lib/ui/app-shell/bootOrchestrator");
    // bootFlag must NOT appear as an export
    expect("bootFlag" in mod).toBe(false);
  });

  test("bootOrchestrator module exports getBootAttempted test-hook", async () => {
    const mod = await import("$lib/ui/app-shell/bootOrchestrator");
    expect(typeof mod.getBootAttempted).toBe("function");
  });

  test("getBootAttempted() returns false on initial module load", () => {
    // On fresh module load (simulating HMR), bootFlag is false
    expect(getBootAttempted()).toBe(false);
  });
});

// ── REQ-021: bootFlag semantics ──────────────────────────────────────────────

describe("REQ-021: bootFlag semantics — write isolation and HMR reset", () => {
  // EC-20: HMR in-flight try_vault_path
  test("EC-20: bootFlag static-analysis — source file declares bootFlag without export keyword", () => {
    const bootOrchestratorPath = path.resolve(
      process.cwd(),
      "src/lib/ui/app-shell/bootOrchestrator.ts"
    );

    if (!fs.existsSync(bootOrchestratorPath)) {
      // Source file doesn't exist yet — that's the RED signal
      throw new Error(
        `EC-20: bootOrchestrator.ts not found at ${bootOrchestratorPath}. ` +
        "Create it in Phase 2b."
      );
    }

    const content = fs.readFileSync(bootOrchestratorPath, "utf-8");
    // bootFlag must be declared (let/const bootFlag) but NOT exported
    expect(content).toMatch(/let\s+bootAttempted|const\s+bootAttempted|var\s+bootAttempted/);
    expect(content).not.toMatch(/export\s+(let|const|var)\s+bootAttempted/);
  });

  test("REQ-021: appShellStore module is a Svelte writable store", async () => {
    // RED PHASE: import fails — module doesn't exist yet
    const mod = await import("$lib/ui/app-shell/appShellStore");
    const store = mod.appShellStore;
    // Svelte writable store has subscribe, set, update
    expect(typeof store.subscribe).toBe("function");
    expect(typeof store.set).toBe("function");
    expect(typeof store.update).toBe("function");
  });
});
