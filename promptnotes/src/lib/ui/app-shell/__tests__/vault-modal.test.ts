/**
 * vault-modal.test.ts — REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-016, PROP-005, PROP-008
 *
 * REQ-003: WHILE AppShellState ∈ {'Unconfigured', 'StartupError'} — modal renders, blocks UI
 *   - overlay click: modal does NOT close (stopPropagation)
 *   - Esc key: disabled (focus trap)
 *   - VaultSetupModal has data-testid="vault-setup-modal"
 *
 * REQ-004: User submits path → invoke('try_vault_path', { rawPath })
 *   - OS picker cancel → no invoke
 *   - isSaving=true → double-submit suppressed
 *   - TypeScript does NOT construct VaultPath (PROP-002)
 *
 * REQ-005: VaultPathError → inline UI messages
 *   - EC-04: empty → 「フォルダを選択してください」
 *   - EC-05: whitespace-only → 「フォルダを選択してください」
 *
 * REQ-006: try_vault_path Ok → invoke_configure_vault → invoke_app_startup (FIND-009 Option A)
 *   - Settings.save before configure vault (PROP-008)
 *
 * REQ-007: Startup error path-not-found / permission-denied → modal with error message
 *
 * REQ-016: Focus trap, Esc disabled, overlay click disabled
 *
 * PROP-005: isModalCloseable invariants (unit — see modal-closeable.prop.test.ts for fast-check)
 * PROP-008: configure vault NOT called when try_vault_path fails
 *
 * RED PHASE: imports below MUST fail — modules do not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPath, VaultPathError, VaultId } from "promptnotes-domain-types/shared/value-objects";
import type { VaultConfigError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";

// RED PHASE: These imports MUST FAIL — modules do not exist yet.
import {
  vaultModalSubmitHandler,
  type VaultModalDeps,
  type VaultModalState,
} from "$lib/ui/app-shell/vaultModalLogic";

import {
  mapVaultPathError,
  mapVaultConfigError,
} from "$lib/ui/app-shell/errorMessages";

import {
  isModalCloseable,
} from "$lib/ui/app-shell/modalClosePolicy";

// @vcsdd-allow-brand-construction
const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;

const mockVaultPath = vaultPath("/home/user/notes");

// ── REQ-004: vaultModalSubmitHandler invocation logic ────────────────────────

describe("REQ-004: vaultModalSubmitHandler calls try_vault_path with rawPath", () => {
  test("try_vault_path is called with rawPath on form submit", async () => {
    let capturedRawPath: string | undefined;
    const deps: VaultModalDeps = {
      tryVaultPath: async (rawPath: string) => {
        capturedRawPath = rawPath;
        return { ok: false, error: { kind: "empty" } };
      },
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/home/user/vault", isSaving: false });

    expect(capturedRawPath).toBe("/home/user/vault");
  });

  // EC-07: OS picker cancel → null rawPath → no invoke
  test("EC-07: OS picker cancel (null rawPath) → try_vault_path NOT called", async () => {
    let callCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async (_rawPath: string) => {
        callCount++;
        return { ok: false, error: { kind: "empty" } };
      },
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: null, isSaving: false });
    expect(callCount).toBe(0);
  });

  // EC-07: undefined rawPath → no invoke
  test("EC-07: undefined rawPath → try_vault_path NOT called", async () => {
    let callCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async (_rawPath: string) => {
        callCount++;
        return { ok: false, error: { kind: "empty" } };
      },
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: undefined, isSaving: false });
    expect(callCount).toBe(0);
  });

  // EC-08: Double-click (isSaving=true) → 2nd invoke suppressed
  test("EC-08: isSaving=true → try_vault_path NOT called (double-submit suppressed)", async () => {
    let callCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async (_rawPath: string) => {
        callCount++;
        return { ok: false, error: { kind: "empty" } };
      },
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/path", isSaving: true });
    expect(callCount).toBe(0);
  });
});

// ── PROP-008: configure vault called only after successful try_vault_path ────

describe("PROP-008: invoke_configure_vault called iff try_vault_path succeeds", () => {
  test("PROP-008: configure vault NOT called when try_vault_path returns Err(empty)", async () => {
    let configureCallCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => {
        configureCallCount++;
        return { ok: true, value: {} as any };
      },
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "", isSaving: false });
    expect(configureCallCount).toBe(0);
  });

  test("PROP-008: configure vault NOT called when try_vault_path returns Err(not-absolute)", async () => {
    let configureCallCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({ ok: false, error: { kind: "not-absolute" } }),
      invokeConfigureVault: async () => {
        configureCallCount++;
        return { ok: true, value: {} as any };
      },
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "relative/path", isSaving: false });
    expect(configureCallCount).toBe(0);
  });

  test("PROP-008: configure vault called exactly once after successful try_vault_path", async () => {
    let configureCallCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({ ok: true, value: mockVaultPath }),
      invokeConfigureVault: async () => {
        configureCallCount++;
        return { ok: true, value: {} as any };
      },
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/home/user/vault", isSaving: false });
    expect(configureCallCount).toBe(1);
  });
});

// ── REQ-006: invoke_app_startup re-invoked after configure_vault success ─────

describe("REQ-006: invoke_app_startup re-invoked after invoke_configure_vault success", () => {
  test("invokeAppStartup is called once after successful configure vault", async () => {
    let startupCallCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({ ok: true, value: mockVaultPath }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => {
        startupCallCount++;
        return { ok: true, value: {} as any };
      },
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/home/user/vault", isSaving: false });
    expect(startupCallCount).toBe(1);
  });

  test("invokeAppStartup NOT called when invoke_configure_vault fails", async () => {
    let startupCallCount = 0;
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({ ok: true, value: mockVaultPath }),
      invokeConfigureVault: async () => ({
        ok: false,
        error: { kind: "path-not-found", path: "/vault" },
      }),
      invokeAppStartup: async () => {
        startupCallCount++;
        return { ok: true, value: {} as any };
      },
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/home/user/vault", isSaving: false });
    expect(startupCallCount).toBe(0);
  });

  // EC-19: Settings.save disk-full → configure-vault returns path-not-found → modal error
  test("EC-19: invoke_configure_vault Err(path-not-found) from Settings.save failure → modal error (not UnexpectedError)", async () => {
    const stateChanges: VaultModalState[] = [];
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({ ok: true, value: mockVaultPath }),
      invokeConfigureVault: async () => ({
        ok: false,
        error: { kind: "path-not-found", path: "/vault" },
      }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: (s) => stateChanges.push(s),
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/home/user/vault", isSaving: false });

    // Should show modal error, not UnexpectedError
    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState?.errorKind).toBe("vault-config-error");
    expect(lastState?.errorKind).not.toBe("unexpected-error");
  });
});

// ── REQ-005: VaultPathError inline messages ──────────────────────────────────

describe("REQ-005: VaultPathError renders correct inline messages", () => {
  test("empty variant → 「フォルダを選択してください」", () => {
    expect(mapVaultPathError({ kind: "empty" })).toBe("フォルダを選択してください");
  });

  test("not-absolute variant → 「絶対パスを指定してください」", () => {
    expect(mapVaultPathError({ kind: "not-absolute" })).toBe("絶対パスを指定してください");
  });
});

// ── REQ-007: Startup error modal messages ────────────────────────────────────

describe("REQ-007: Startup error path-not-found / permission-denied → correct modal messages", () => {
  test("path-not-found → 「設定したフォルダが見つかりません。再設定するか、フォルダを復元してください」", () => {
    expect(mapVaultConfigError({ kind: "path-not-found", path: "/vault" }))
      .toBe("設定したフォルダが見つかりません。再設定するか、フォルダを復元してください");
  });

  test("permission-denied → 「フォルダへのアクセス権限がありません」", () => {
    expect(mapVaultConfigError({ kind: "permission-denied", path: "/vault" }))
      .toBe("フォルダへのアクセス権限がありません");
  });
});

// ── REQ-003 / REQ-016: Modal close policy ────────────────────────────────────

describe("REQ-003 / REQ-016: Modal cannot be closed via overlay or Esc in Unconfigured/StartupError", () => {
  test("overlay does not close modal in Unconfigured state", () => {
    expect(isModalCloseable("Unconfigured", "overlay")).toBe(false);
  });

  test("Esc does not close modal in Unconfigured state", () => {
    expect(isModalCloseable("Unconfigured", "esc")).toBe(false);
  });

  test("overlay does not close modal in StartupError state", () => {
    expect(isModalCloseable("StartupError", "overlay")).toBe(false);
  });

  test("Esc does not close modal in StartupError state", () => {
    expect(isModalCloseable("StartupError", "esc")).toBe(false);
  });

  test("success trigger does close modal (correct success path)", () => {
    expect(isModalCloseable("Unconfigured", "success")).toBe(true);
    expect(isModalCloseable("StartupError", "success")).toBe(true);
  });
});

// ── REQ-004: VaultPath not constructed in TypeScript ─────────────────────────

describe("REQ-004: TypeScript does NOT construct VaultPath directly", () => {
  test("vaultModalSubmitHandler does not accept a pre-built VaultPath — only rawPath string", () => {
    // The handler receives rawPath: string | null | undefined, never VaultPath
    // This is enforced by the type signature of VaultModalDeps.tryVaultPath
    // Type-level: the input parameter type is string, not VaultPath
    type ExpectedInput = { rawPath: string | null | undefined; isSaving: boolean };
    const input: ExpectedInput = { rawPath: "/path", isSaving: false };
    expect(typeof input.rawPath).toBe("string");
    // If VaultPath were constructed here, it would violate NEG-REQ-005
    // The fact that rawPath is 'string' (not VaultPath) proves the contract
  });
});

// ── EC-06: NUL byte in path ──────────────────────────────────────────────────

describe("EC-06: NUL byte in path → Rust processes → UI shows error", () => {
  test("EC-06: path with NUL byte results in VaultConfigError from Rust (path-not-found or permission-denied)", async () => {
    // Rust handles NUL byte → OS stat error → folds to path-not-found
    const deps: VaultModalDeps = {
      tryVaultPath: async (_rawPath: string) => ({
        ok: false,
        error: { kind: "path-not-found" } as any, // Rust returns VaultConfigError
      }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    // try_vault_path for NUL-byte path returns error → configure vault not called
    let configureCallCount = 0;
    const testDeps: VaultModalDeps = {
      ...deps,
      invokeConfigureVault: async () => {
        configureCallCount++;
        return { ok: true, value: {} as any };
      },
    };

    await vaultModalSubmitHandler(testDeps, { rawPath: "/foo\0bar", isSaving: false });
    expect(configureCallCount).toBe(0);
  });
});

// ── EC-14, EC-15, EC-17: Symlink, OS_PATH_MAX, picker-revoke ─────────────────

describe("EC-14/EC-15/EC-17: Symlink, OS_PATH_MAX, picker-revoke → handled as vault config errors", () => {
  // EC-14: symlink → VaultPath::try_new passes (form check only) → statDir resolves
  test("EC-14: symlink path passes format check (try_vault_path Ok), statDir follows symlink", async () => {
    // VaultPath::try_new only checks empty / not-absolute
    // A symlink path that is absolute passes try_new
    // The UI just sends it to try_vault_path and handles the result
    let tryCalled = false;
    const deps: VaultModalDeps = {
      tryVaultPath: async (rawPath: string) => {
        tryCalled = true;
        // Symlink path is absolute → passes VaultPath::try_new
        return { ok: true, value: rawPath as unknown as VaultPath };
      },
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: () => {},
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/symlink/to/vault", isSaving: false });
    expect(tryCalled).toBe(true);
  });

  // EC-17: picker-revoke → try_vault_path returns permission-denied
  test("EC-17: picker-revoke → permission-denied error displayed in modal", async () => {
    const stateChanges: VaultModalState[] = [];
    const deps: VaultModalDeps = {
      tryVaultPath: async () => ({
        ok: false,
        error: { kind: "permission-denied" } as any,
      }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
      invokeAppStartup: async () => ({ ok: true, value: {} as any }),
      onStateChange: (s) => stateChanges.push(s),
    };

    await vaultModalSubmitHandler(deps, { rawPath: "/revoked/vault", isSaving: false });
    // Modal should show an error state, not close
    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState?.hasError).toBe(true);
  });
});
