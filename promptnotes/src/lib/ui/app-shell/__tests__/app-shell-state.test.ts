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
  __resetBootFlagForTesting__,
} from "$lib/ui/app-shell/bootOrchestrator";

import {
  __resetForTesting__ as __resetStoreTesting__,
} from "$lib/ui/app-shell/appShellStore";

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
    // FIND-211: Reset store to initial state before checking.
    // In production, the module is freshly imported and the store starts as 'Loading'.
    // In bun:test, modules are shared across files, so we reset via the test hook.
    __resetStoreTesting__();
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
  test("PROP-012: getBootAttempted() returns false on fresh module import (or after HMR reset)", () => {
    // getBootAttempted() is a @vcsdd-test-hook export that reads the internal bootFlag.
    // On module load, bootFlag === false (HMR reset to false).
    // In bun:test, the module is shared across tests in the same run, so we use the
    // FIND-211 test hook __resetBootFlagForTesting__ to simulate an HMR module re-import.
    __resetBootFlagForTesting__();
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

    const routeResult = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(routeResult.state).toBe("UnexpectedError");
  });

  test("PROP-009: IPC crash (thrown exception) → UnexpectedError via bootOrchestrator", async () => {
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        throw new Error("IPC crash: Tauri bridge unavailable");
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const routeResult = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(routeResult.state).toBe("UnexpectedError");
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

    const routeResult = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    expect(routeResult.state).toBe("UnexpectedError");
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

// ── PROP-010: modal state transition within 100ms of IPC resolution ──────────
// REQ-018: The Unconfigured / StartupError state (and hence modal) must be set
// within 100ms of the IPC promise resolving. We cannot mount DOM here (no
// @testing-library/svelte), so we test the logic-layer timing contract: measure
// wall-clock elapsed from IPC resolve to store-state-set.

describe("PROP-010: Unconfigured state SET within 100ms of IPC resolve (REQ-018 timing guard)", () => {
  test("PROP-010: store transitions to Unconfigured and elapsed time is under 100ms", async () => {
    // The IPC returns immediately (no artificial delay).
    // We record the timestamp AFTER the IPC mock resolves, then measure how
    // long until the store value is Unconfigured.
    let ipcResolvedAt: number | undefined;

    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        const result = {
          ok: false as const,
          error: { kind: "config" as const, reason: { kind: "unconfigured" as const } },
        };
        ipcResolvedAt = Date.now();
        return result;
      },
      tryVaultPath: async () => ({ ok: false as const, error: { kind: "empty" as const } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const routeResult = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    const storeSetAt = Date.now();

    expect(routeResult.state).toBe("Unconfigured");
    expect(ipcResolvedAt).toBeDefined();
    // The store must be set within 100ms of the IPC promise resolving.
    // In synchronous JS this is essentially 0ms — the guard is 100ms.
    const elapsed = storeSetAt - ipcResolvedAt!;
    expect(elapsed).toBeLessThan(100);
  });

  test("PROP-010: StartupError state SET within 100ms of IPC resolve (path-not-found path)", async () => {
    let ipcResolvedAt: number | undefined;

    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => {
        const result = {
          ok: false as const,
          error: {
            kind: "config" as const,
            reason: { kind: "path-not-found" as const, path: "/vault" },
          },
        };
        ipcResolvedAt = Date.now();
        return result;
      },
      tryVaultPath: async () => ({ ok: false as const, error: { kind: "empty" as const } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const routeResult = await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });
    const storeSetAt = Date.now();

    expect(routeResult.state).toBe("StartupError");
    expect(ipcResolvedAt).toBeDefined();
    const elapsed = storeSetAt - ipcResolvedAt!;
    expect(elapsed).toBeLessThan(100);
  });

  test("PROP-010: appShellStore value is Unconfigured immediately after bootOrchestrator resolves", async () => {
    // Verify the store (observable) is already Unconfigured when we subscribe
    // right after bootOrchestrator completes — no asynchronous deferred write.
    const mockAdapter: TauriAdapter = {
      invokeAppStartup: async () => ({
        ok: false as const,
        error: { kind: "config" as const, reason: { kind: "unconfigured" as const } },
      }),
      tryVaultPath: async () => ({ ok: false as const, error: { kind: "empty" as const } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    await bootOrchestrator({ adapter: mockAdapter, isBootAttempted: false });

    // Read current store value synchronously
    let currentValue: AppShellState | undefined;
    const unsub = appShellStore.subscribe((v) => { currentValue = v; });
    unsub();

    expect(currentValue).toBe("Unconfigured");
  });
});
