/**
 * loading-state.test.ts — REQ-020, PROP-001 (loading transitions subset)
 *
 * REQ-020: Loading 状態の定義と描画
 *   - appShellStore の初期値が 'Loading'
 *   - Loading 中はモーダルを表示しない
 *   - Loading からの合法的遷移先: 'Configured', 'Unconfigured', 'StartupError', 'UnexpectedError'
 *   - Loading → Loading への遷移は無効 (bootAttempted フラグで抑制)
 *   - Loading 描画: role="status", aria-busy="true", aria-label="読み込み中"
 *   - Loading 中は VaultSetupModal が DOM にない
 *
 * RED PHASE: imports below MUST fail — modules do not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPath, VaultId } from "promptnotes-domain-types/shared/value-objects";

// RED PHASE: These imports MUST FAIL — modules do not exist yet.
import {
  appShellStore,
  type AppShellState,
} from "$lib/ui/app-shell/appShellStore";

import {
  LOADING_ARIA_ATTRIBUTES,
} from "$lib/ui/app-shell/loadingState";

import {
  bootOrchestrator,
} from "$lib/ui/app-shell/bootOrchestrator";

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

// ── REQ-020: appShellStore initial value ──────────────────────────────────────

describe("REQ-020: appShellStore initial value is 'Loading' at module import", () => {
  test("fresh store subscribe() immediately yields 'Loading'", () => {
    let currentValue: AppShellState | undefined;
    const unsubscribe = appShellStore.subscribe((v) => { currentValue = v; });
    unsubscribe();
    expect(currentValue).toBe("Loading");
  });
});

// ── REQ-020: Loading aria attributes ─────────────────────────────────────────

describe("REQ-020: Loading state aria attributes", () => {
  test("LOADING_ARIA_ATTRIBUTES has role='status'", () => {
    expect(LOADING_ARIA_ATTRIBUTES.role).toBe("status");
  });

  test("LOADING_ARIA_ATTRIBUTES has aria-busy='true'", () => {
    expect(LOADING_ARIA_ATTRIBUTES["aria-busy"]).toBe("true");
  });

  test("LOADING_ARIA_ATTRIBUTES has aria-label='読み込み中'", () => {
    expect(LOADING_ARIA_ATTRIBUTES["aria-label"]).toBe("読み込み中");
  });
});

// ── REQ-020: Loading → valid transitions only ─────────────────────────────────

describe("REQ-020: Loading state allows exactly 4 target transitions", () => {
  const validTransitions: AppShellState[] = ["Configured", "Unconfigured", "StartupError", "UnexpectedError"];

  test("bootOrchestrator transitions from Loading → Configured on Ok result", async () => {
    const adapter = {
      invokeAppStartup: async () => ({ ok: true, value: mockInitialUIState as any }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };
    const result = await bootOrchestrator({ adapter, isBootAttempted: false });
    expect(validTransitions).toContain(result);
    expect(result).toBe("Configured");
  });

  test("bootOrchestrator transitions from Loading → Unconfigured on unconfigured error", async () => {
    const adapter = {
      invokeAppStartup: async () => ({
        ok: false,
        error: { kind: "config", reason: { kind: "unconfigured" } },
      }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };
    const result = await bootOrchestrator({ adapter, isBootAttempted: false });
    expect(validTransitions).toContain(result);
    expect(result).toBe("Unconfigured");
  });

  test("bootOrchestrator transitions from Loading → StartupError on path-not-found error", async () => {
    const adapter = {
      invokeAppStartup: async () => ({
        ok: false,
        error: { kind: "config", reason: { kind: "path-not-found", path: "/x" } },
      }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };
    const result = await bootOrchestrator({ adapter, isBootAttempted: false });
    expect(validTransitions).toContain(result);
    expect(result).toBe("StartupError");
  });

  test("bootOrchestrator transitions from Loading → UnexpectedError on scan error", async () => {
    const adapter = {
      invokeAppStartup: async () => ({
        ok: false,
        error: { kind: "scan", reason: { kind: "list-failed", detail: "" } },
      }),
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };
    const result = await bootOrchestrator({ adapter, isBootAttempted: false });
    expect(validTransitions).toContain(result);
    expect(result).toBe("UnexpectedError");
  });

  test("bootOrchestrator NEVER transitions from Loading → Loading (double-boot suppressed)", async () => {
    let callCount = 0;
    const adapter = {
      invokeAppStartup: async () => {
        callCount++;
        return { ok: true, value: mockInitialUIState as any };
      },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };

    // First boot
    const result1 = await bootOrchestrator({ adapter, isBootAttempted: false });
    // Attempted second boot with bootAttempted=true (suppressed)
    const result2 = await bootOrchestrator({ adapter, isBootAttempted: true });

    expect(callCount).toBe(1); // Only invoked once
    // result2 should return current state (not attempt another invoke)
    // It should not be 'Loading' — Loading is only the initial/transient state
  });
});
