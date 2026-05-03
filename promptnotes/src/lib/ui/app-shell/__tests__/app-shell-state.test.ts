/**
 * app-shell-state.test.ts — REQ-001, REQ-002, REQ-020, PROP-001, PROP-013, PROP-009, PROP-010, PROP-012
 *
 * REQ-001: 起動時 AppStartup パイプライン呼び出し
 *   - onMount で invoke_app_startup が 1 回呼ばれる (bootAttempted === false)
 *   - bootAttempted === true なら再度 invoke しない (HMR double-mount)
 *   - invoke 前に AppShellState を 'Loading' に遷移する
 *
 * REQ-002: AppStartup 結果の UI 状態へのルーティング (all 5 paths)
 *
 * REQ-020: Loading 状態の定義
 *   - appShellStore の初期値が 'Loading'
 *   - Loading 中はモーダルを表示しない
 *   - Loading → 4 valid transitions only
 *
 * PROP-001: AppStartup パイプラインがシングルマウントで 1 回呼ばれる
 * PROP-013: in-process 再マウント時も合計 1 回のみ呼ばれる（bootFlag 抑制）
 * PROP-009: scan エラー / IPC クラッシュ時はバナーのみ表示（モーダルなし）
 * PROP-010: モーダルが 100ms 以内に表示される
 * PROP-012: bootFlag はモジュールスコープで宣言され HMR 後にリセットされる
 *
 * NOTE: Svelte component tests (AppShell.svelte) are stubbed — @testing-library/svelte
 * is not yet installed. These tests target the pure logic layer (appShellStore, bootFlag)
 * and the tauriAdapter integration. The comment-stubs document the test intent so they
 * compile-fail on the import of missing modules — that is the RED signal.
 *
 * RED PHASE: imports below MUST fail — modules do not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPath, VaultId } from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";

// RED PHASE: These imports MUST FAIL — modules do not exist yet.
import {
  appShellStore,
  type AppShellState,
} from "$lib/ui/app-shell/appShellStore";

import {
  createTauriAdapter,
  type TauriAdapter,
  PIPELINE_IPC_TIMEOUT_MS,
} from "$lib/ui/app-shell/tauriAdapter";

import {
  bootOrchestrator,
  getBootAttempted,
} from "$lib/ui/app-shell/bootOrchestrator";

// ── Fixture helpers ──────────────────────────────────────────────────────────
// @vcsdd-allow-brand-construction
const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;

const mockInitialUIState = {
  vaultPath: vaultPath("/home/user/notes"),
  vaultId: vaultId("vault-id"),
  feed: { notes: [], filteredNotes: [] },
  tagInventory: { tags: [] },
  corruptedFiles: [],
  editingSessionState: { kind: "ready" as const },
};

// ── REQ-020: appShellStore initial value is 'Loading' ────────────────────────

describe("REQ-020: appShellStore initial value is 'Loading'", () => {
  test("appShellStore initial value is 'Loading' (module-import time)", () => {
    let currentValue: AppShellState | undefined;
    const unsubscribe = appShellStore.subscribe((v) => { currentValue = v; });
    unsubscribe();
    expect(currentValue).toBe("Loading");
  });
});

// ── REQ-022: PIPELINE_IPC_TIMEOUT_MS constant ────────────────────────────────

describe("REQ-022: PIPELINE_IPC_TIMEOUT_MS constant is 30000", () => {
  test("PIPELINE_IPC_TIMEOUT_MS === 30000 (ms) exported from tauriAdapter", () => {
    expect(PIPELINE_IPC_TIMEOUT_MS).toBe(30000);
  });
});

// ── PROP-001: AppStartup invoked exactly once on first boot ──────────────────

describe("PROP-001: bootOrchestrator invokes AppStartup exactly once on fresh boot", () => {
  test("PROP-001: invokeAppStartup spy called exactly 1 time on bootAttempted=false", async () => {
    // Mock adapter that resolves immediately
    let callCount = 0;
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        callCount++;
        return { ok: true, value: mockInitialUIState as any };
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    // Reset boot state for test isolation
    const result = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(callCount).toBe(1);
  });

  test("PROP-001: invokeAppStartup NOT called when bootAttempted=true", async () => {
    let callCount = 0;
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        callCount++;
        return { ok: true, value: mockInitialUIState as any };
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    // bootAttempted=true simulates HMR in-process re-mount suppression
    await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: true });
    expect(callCount).toBe(0);
  });
});

// ── PROP-013: in-process re-mount suppressed by bootFlag ────────────────────

describe("PROP-013: in-process re-mount — bootFlag suppresses 2nd invoke (same module instance)", () => {
  test("PROP-013: invokeAppStartup called 1 time even after mount→unmount→re-mount sequence", async () => {
    let callCount = 0;
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        callCount++;
        return { ok: true, value: mockInitialUIState as any };
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    // First mount: bootAttempted=false → invokes
    await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    // Simulated unmount + re-mount in same module instance: bootAttempted=true → no re-invoke
    await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: true });

    expect(callCount).toBe(1);
  });
});

// ── PROP-012: bootFlag resets on module re-import (HMR simulation) ──────────

describe("PROP-012: bootFlag resets on module re-import (HMR simulation)", () => {
  test("PROP-012: getBootAttempted() returns false on fresh module import", () => {
    // getBootAttempted() is a @vcsdd-test-hook export that reads the internal bootFlag
    // On module load, bootFlag === false (HMR reset to false)
    expect(getBootAttempted()).toBe(false);
  });

  test("PROP-012: bootFlag is not exported as a writable from bootOrchestrator module", async () => {
    // Re-import the module and check that 'bootFlag' is not exported as a writable symbol
    const mod = await import("$lib/ui/app-shell/bootOrchestrator");
    expect("bootFlag" in mod).toBe(false); // bootFlag must NOT be exported
    expect("getBootAttempted" in mod).toBe(true); // test hook must be exported
  });
});

// ── PROP-009: scan error / IPC crash → banner only (no modal) ───────────────

describe("PROP-009: scan error / IPC crash → UnexpectedError state, no modal", () => {
  test("PROP-009: scan error routes to UnexpectedError via bootOrchestrator", async () => {
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => ({
        ok: false,
        error: { kind: "scan", reason: { kind: "list-failed", detail: "disk error" } },
      }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const resultState = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(resultState).toBe("UnexpectedError");
  });

  test("PROP-009: IPC crash (thrown exception) → UnexpectedError via bootOrchestrator", async () => {
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        throw new Error("IPC crash: Tauri bridge unavailable");
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const resultState = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(resultState).toBe("UnexpectedError");
  });

  // EC-13: IPC crash → UnexpectedError
  test("EC-13: invoke_app_startup IPC crash → UnexpectedError", async () => {
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        throw new Error("IPC bridge down");
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const resultState = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(resultState).toBe("UnexpectedError");
  });
});

// ── REQ-001: Loading state set before invoke ─────────────────────────────────

describe("REQ-001: AppShellState transitions to Loading BEFORE invoke_app_startup resolves", () => {
  test("bootOrchestrator sets store to Loading during pending invoke", async () => {
    const statesObserved: AppShellState[] = [];
    let resolvePromise!: (v: any) => void;

    const slowAdapter: TauriAdapter = {
      invokeAppStartup: () => new Promise((resolve) => { resolvePromise = resolve; }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    // Start the orchestrator (non-blocking)
    const bootPromise = bootOrchestrator({ adapter: slowAdapter, isBootAttempted: false });

    // Subscribe to store and capture values
    const unsubscribe = appShellStore.subscribe((v) => statesObserved.push(v));

    // Store should be 'Loading' while pending
    expect(statesObserved[statesObserved.length - 1]).toBe("Loading");

    // Now resolve the promise
    resolvePromise({ ok: true, value: mockInitialUIState as any });
    await bootPromise;

    unsubscribe();
    // Final state should be 'Configured'
    expect(statesObserved[statesObserved.length - 1]).toBe("Configured");
  });
});

// ── PROP-010 stub: modal within 100ms ────────────────────────────────────────
// NOTE: Full test requires @testing-library/svelte for DOM assertion.
// This stub verifies the store transitions synchronously after the Promise resolves.

describe("PROP-010 (logic layer): Unconfigured state set synchronously on Promise resolution", () => {
  test("PROP-010 stub: store transitions to Unconfigured synchronously after unconfigured result", async () => {
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => ({
        ok: false,
        error: { kind: "config", reason: { kind: "unconfigured" } },
      }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const resultState = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(resultState).toBe("Unconfigured");
  });
});
