/**
 * startup-error-routing.test.ts — REQ-008, REQ-009, REQ-010, PROP-007, PROP-009
 *
 * REQ-008: Unexpected エラー状態 — インラインバナー表示
 *   - AppStartupError.kind === 'scan' → UnexpectedError → バナー表示, モーダル非表示
 *   - Tauri IPC クラッシュ → UnexpectedError → バナー表示, モーダル非表示
 *   - IPC タイムアウト (REQ-022) → UnexpectedError
 *   - バナーは role="alert"
 *   - バナーは data-testid="startup-error-banner"
 *   - バナーはフォーカスを奪わない (autofocus なし)
 *
 * REQ-009: 破損ファイル警告バナー (cross-reference corrupted-banner.unit.test.ts)
 *
 * REQ-010: グローバルレイアウトフレーム — ヘッダー
 *   - data-testid assertions for header structure
 *
 * PROP-007: PathNotFound / PermissionDenied → StartupError routing (all 5 paths)
 * PROP-009: scan エラー / IPC クラッシュ時はバナーのみ (no modal)
 *
 * RED PHASE: imports below MUST fail — modules do not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath, VaultId } from "promptnotes-domain-types/shared/value-objects";

// RED PHASE: These imports MUST FAIL — modules do not exist yet.
import {
  routeStartupResult,
  type AppShellState,
  type AppShellRouteResult,
} from "$lib/ui/app-shell/routeStartupResult";

import {
  ERROR_BANNER_TESTID,
  ERROR_BANNER_ROLE,
  STARTUP_ERROR_MESSAGE_TESTID,
  VAULT_SETUP_MODAL_TESTID,
} from "$lib/ui/app-shell/componentTestIds";

import {
  bootOrchestrator,
} from "$lib/ui/app-shell/bootOrchestrator";

// @vcsdd-allow-brand-construction
const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;

// ── REQ-008 / PROP-009: UnexpectedError routing ───────────────────────────────

describe("REQ-008 / PROP-009: scan error → UnexpectedError (banner, not modal)", () => {
  test("routeStartupResult for scan error returns state=UnexpectedError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "I/O error" } },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("UnexpectedError");
  });

  test("PROP-009: scan error state does NOT include modal-open flag", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "disk error" } },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("UnexpectedError");
    // In UnexpectedError, modal should not be shown
    // The routeResult should indicate isModalOpen=false or equivalent
    expect(routed.isModalOpen).toBe(false);
  });
});

// ── REQ-008: Error banner testId and role ────────────────────────────────────

describe("REQ-008: Error banner component IDs match spec", () => {
  test("ERROR_BANNER_TESTID is 'startup-error-banner'", () => {
    expect(ERROR_BANNER_TESTID).toBe("startup-error-banner");
  });

  test("ERROR_BANNER_ROLE is 'alert'", () => {
    expect(ERROR_BANNER_ROLE).toBe("alert");
  });

  test("STARTUP_ERROR_MESSAGE_TESTID is 'startup-error-message'", () => {
    expect(STARTUP_ERROR_MESSAGE_TESTID).toBe("startup-error-message");
  });

  test("VAULT_SETUP_MODAL_TESTID is 'vault-setup-modal'", () => {
    expect(VAULT_SETUP_MODAL_TESTID).toBe("vault-setup-modal");
  });
});

// ── PROP-007: All 5 routeStartupResult paths ─────────────────────────────────

describe("PROP-007: All 5 AppStartupError paths route to correct AppShellState", () => {
  test("PROP-007: Ok(InitialUIState) → Configured", () => {
    const result: Result<any, AppStartupError> = { ok: true, value: {} };
    expect(routeStartupResult(result).state).toBe("Configured");
  });

  test("PROP-007: unconfigured → Unconfigured", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
    expect(routeStartupResult(result).state).toBe("Unconfigured");
  });

  test("PROP-007: path-not-found → StartupError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "path-not-found", path: "/x" } },
    };
    expect(routeStartupResult(result).state).toBe("StartupError");
  });

  test("PROP-007: permission-denied → StartupError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "permission-denied", path: "/x" } },
    };
    expect(routeStartupResult(result).state).toBe("StartupError");
  });

  test("PROP-007: list-failed → UnexpectedError", () => {
    const result: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "" } },
    };
    expect(routeStartupResult(result).state).toBe("UnexpectedError");
  });
});

// ── REQ-008: IPC crash → UnexpectedError ─────────────────────────────────────

describe("REQ-008: IPC crash transitions to UnexpectedError", () => {
  test("IPC crash (exception) → UnexpectedError via bootOrchestrator", async () => {
    const adapter = {
      invokeAppStartup: async () => { throw new Error("Tauri IPC unavailable"); },
      tryVaultPath: async () => ({ ok: false, error: { kind: "empty" } }),
      invokeConfigureVault: async () => ({ ok: true, value: {} as any }),
    };
    const routeResult = await bootOrchestrator({ adapter, isBootAttempted: false });
    expect(routeResult.state).toBe("UnexpectedError");
  });
});

// ── REQ-009 / PROP-004: corruptedFiles routing ───────────────────────────────

describe("REQ-009: Configured state with corruptedFiles routes banner correctly", () => {
  test("routeStartupResult for Ok with corruptedFiles.length >= 1 returns showCorruptedBanner=true", () => {
    const result: Result<any, AppStartupError> = {
      ok: true,
      value: {
        corruptedFiles: [{ filePath: "/vault/broken.md" }],
      },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("Configured");
    expect(routed.showCorruptedBanner).toBe(true);
  });

  test("routeStartupResult for Ok with corruptedFiles.length === 0 returns showCorruptedBanner=false", () => {
    const result: Result<any, AppStartupError> = {
      ok: true,
      value: {
        corruptedFiles: [],
      },
    };
    const routed = routeStartupResult(result);
    expect(routed.state).toBe("Configured");
    expect(routed.showCorruptedBanner).toBe(false);
  });
});
