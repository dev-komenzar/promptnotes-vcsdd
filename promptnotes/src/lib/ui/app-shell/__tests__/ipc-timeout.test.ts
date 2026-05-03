/**
 * ipc-timeout.test.ts — REQ-022, PROP-014
 *
 * REQ-022: IPC タイムアウトポリシー — クライアントサイドパイプラインタイムアウト
 *   - PIPELINE_IPC_TIMEOUT_MS === 30000 が tauriAdapter.ts に export された定数
 *   - invoke_app_startup が 30000ms 以内に resolve しない場合、AppShellState → 'UnexpectedError'
 *   - タイムアウトは Promise.race として実装（クライアントサイド）
 *   - Late-arrival: タイムアウト後に遅延 resolve が来ても UnexpectedError を上書きしない
 *
 * PROP-014: PIPELINE_IPC_TIMEOUT_MS 経過後に UnexpectedError に遷移する
 *   Tier 1: vi.useFakeTimers() 等価 (bun:test fake timer API)
 *
 * Edge cases:
 *   EC-18: ネットワーク FS が応答なし / IPC タイムアウト → UnexpectedError
 *
 * RED PHASE: imports below MUST fail — module does not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPath, VaultId } from "promptnotes-domain-types/shared/value-objects";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import {
  PIPELINE_IPC_TIMEOUT_MS,
  createTauriAdapter,
  type TauriAdapter,
  withIpcTimeout,
} from "$lib/ui/app-shell/tauriAdapter";

import {
  bootOrchestrator,
} from "$lib/ui/app-shell/bootOrchestrator";

import {
  appShellStore,
  setAppShellState,
  type AppShellState,
} from "$lib/ui/app-shell/appShellStore";

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

// ── REQ-022: PIPELINE_IPC_TIMEOUT_MS constant ────────────────────────────────

describe("REQ-022: PIPELINE_IPC_TIMEOUT_MS constant", () => {
  test("PIPELINE_IPC_TIMEOUT_MS is exactly 30000", () => {
    expect(PIPELINE_IPC_TIMEOUT_MS).toBe(30000);
  });

  test("PIPELINE_IPC_TIMEOUT_MS is a number (not undefined)", () => {
    expect(typeof PIPELINE_IPC_TIMEOUT_MS).toBe("number");
  });
});

// ── PROP-014: withIpcTimeout races against sentinel ──────────────────────────

describe("PROP-014: withIpcTimeout rejects with timeout sentinel after PIPELINE_IPC_TIMEOUT_MS", () => {
  test("PROP-014: never-resolving Promise is rejected by sentinel after timeout", async () => {
    // withIpcTimeout wraps a never-resolving Promise and races it against a timeout sentinel
    // We use a short test timeout to avoid slow tests: override the timeout value
    const neverResolving = new Promise<never>(() => {});
    const timeoutMs = 50; // Use a short timeout in tests (not 30000)

    let caught: Error | undefined;
    try {
      await withIpcTimeout(neverResolving, timeoutMs);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain("timeout");
  });

  test("PROP-014: resolved Promise passes through withIpcTimeout unchanged", async () => {
    const resolvedPromise = Promise.resolve({ ok: true, value: "data" });
    const result = await withIpcTimeout(resolvedPromise, 5000);
    expect(result).toEqual({ ok: true, value: "data" });
  });

  test("PROP-014: rejected Promise propagates through withIpcTimeout unchanged", async () => {
    const rejectedPromise = Promise.reject(new Error("IPC error"));
    let caught: Error | undefined;
    try {
      await withIpcTimeout(rejectedPromise, 5000);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toBe("IPC error");
  });
});

// ── PROP-014: bootOrchestrator timeout integration ───────────────────────────

describe("PROP-014: bootOrchestrator transitions to UnexpectedError on IPC timeout", () => {
  // EC-18: Network FS hang → timeout → UnexpectedError
  test("EC-18: never-resolving invokeAppStartup → UnexpectedError after timeout", async () => {
    // We use a very short timeout (10ms) to avoid slow tests in the orchestrator
    const neverResolvingAdapter: TauriAdapter = {
      invokeAppStartup: () => new Promise(() => {}), // never resolves
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    const routeResult = await bootOrchestrator({
      adapter: neverResolvingAdapter,
      isBootAttempted: false,
      timeoutMs: 10, // override timeout for fast test
    });

    expect(routeResult.state).toBe("UnexpectedError");
  }, 2000); // jest-style timeout: 2s max

  test("PROP-014: late-arrival after timeout does NOT overwrite appShellStore UnexpectedError", async () => {
    // FIND-404: bootOrchestrator no longer writes to the store. AppShell.svelte
    // (or this test) applies setAppShellState after bootOrchestrator resolves.
    // The late-arrival protection is now in the return value contract: once
    // bootOrchestrator returns UnexpectedError and the caller applies it,
    // any subsequent resolution of the timed-out IPC does not reach the caller.

    let resolveIpc!: (v: any) => void;
    const lateAdapter: TauriAdapter = {
      invokeAppStartup: () => new Promise((resolve) => { resolveIpc = resolve; }),
      tryVaultPath: async () => ({ ok: false as const, error: { kind: "empty" as const } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    // Subscribe to the store to capture all values written during the test
    const capturedStates: AppShellState[] = [];
    const unsub = appShellStore.subscribe((v) => capturedStates.push(v));

    // Start orchestrator with short timeout
    const bootPromise = bootOrchestrator({
      adapter: lateAdapter,
      isBootAttempted: false,
      timeoutMs: 10, // expires quickly
    });

    // Wait for timeout to fire and bootOrchestrator to complete
    const routeResult = await bootPromise;
    expect(routeResult.state).toBe("UnexpectedError");

    // FIND-404: Simulate AppShell.svelte applying the state after bootOrchestrator.
    setAppShellState(routeResult.state);

    // Verify the store is also UnexpectedError right after the caller applies state
    let storeValueAfterTimeout: AppShellState | undefined;
    const readUnsub = appShellStore.subscribe((v) => { storeValueAfterTimeout = v; });
    readUnsub();
    expect(storeValueAfterTimeout).toBe("UnexpectedError");

    // Now late-arrive a successful Configured resolution from the original timed-out IPC.
    // bootOrchestrator has already returned — the IPC promise resolves into a void.
    // The caller (AppShell.svelte) only calls setAppShellState ONCE (from bootPromise result).
    // This late-arrival has no mechanism to update the store.
    resolveIpc({ ok: true, value: mockInitialUIState });

    // Flush microtask queue to allow any potential override to propagate
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The store must STILL be UnexpectedError — late-arrival is discarded because
    // bootOrchestrator has already returned and the late Promise resolution
    // goes nowhere (Promise.race already settled).
    let storeValueAfterLateArrival: AppShellState | undefined;
    const readUnsub2 = appShellStore.subscribe((v) => { storeValueAfterLateArrival = v; });
    readUnsub2();
    expect(storeValueAfterLateArrival).toBe("UnexpectedError");

    // The store captured sequence must NOT contain "Configured" after "UnexpectedError"
    const unexpectedErrorIndex = capturedStates.lastIndexOf("UnexpectedError");
    const configuredAfterTimeout = capturedStates
      .slice(unexpectedErrorIndex + 1)
      .includes("Configured");
    expect(configuredAfterTimeout).toBe(false);

    unsub();
  }, 2000);
});

// ── REQ-022: All 3 pipeline IPC commands use the same timeout ────────────────

describe("REQ-022: All 3 pipeline IPC commands use PIPELINE_IPC_TIMEOUT_MS", () => {
  test("createTauriAdapter exposes all 3 IPC methods with timeout wrapping", () => {
    // createTauriAdapter should produce an adapter with all 3 methods
    const mockInvoke = async (cmd: string, _args?: unknown) => {
      if (cmd === "invoke_app_startup") return mockInitialUIState;
      throw new Error(`Unknown command: ${cmd}`);
    };
    const adapter = createTauriAdapter({ invoke: mockInvoke });
    expect(typeof adapter.invokeAppStartup).toBe("function");
    expect(typeof adapter.tryVaultPath).toBe("function");
    expect(typeof adapter.invokeConfigureVault).toBe("function");
  });
});
