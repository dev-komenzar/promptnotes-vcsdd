/**
 * route-startup-result.test.ts — REQ-002, PROP-007
 *
 * REQ-002: AppStartup 結果の UI 状態へのルーティング
 *   - Ok(InitialUIState) → 'Configured'
 *   - Err({ kind:'config', reason:{ kind:'unconfigured' } }) → 'Unconfigured'
 *   - Err({ kind:'config', reason:{ kind:'path-not-found', path } }) → 'StartupError'
 *   - Err({ kind:'config', reason:{ kind:'permission-denied', path } }) → 'StartupError'
 *   - Err({ kind:'scan', reason:{ kind:'list-failed' } }) → 'UnexpectedError'
 *   - Tauri IPC クラッシュ (thrown exception) → 'UnexpectedError'
 *
 * PROP-007: PathNotFound および PermissionDenied 起動エラーの両方が 'StartupError' にルーティングされる
 *   全 5 AppStartupError 経路を網羅
 *
 * RED PHASE: imports below MUST fail — $lib/ui/app-shell/routeStartupResult does not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPath, VaultId, NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import {
  routeStartupResult,
  type AppShellState,
  type AppShellRouteResult,
} from "$lib/ui/app-shell/routeStartupResult";

// ── Fixture helpers (brand casts) ────────────────────────────────────────────
// @vcsdd-allow-brand-construction
const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;
const noteId = (s: string): NoteId => s as unknown as NoteId;
const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

const mockInitialUIState = {
  vaultPath: vaultPath("/home/user/notes"),
  vaultId: vaultId("vault-id"),
  feed: { notes: [], filteredNotes: [] },
  tagInventory: { tags: [] },
  corruptedFiles: [],
  editingSessionState: { kind: "ready" as const },
};

// ── REQ-002 / PROP-007: routeStartupResult all 5 paths ───────────────────────

describe("REQ-002 / PROP-007: routeStartupResult routes all AppStartupError variants", () => {
  test("Ok(InitialUIState) routes to 'Configured'", () => {
    const input: Result<typeof mockInitialUIState, AppStartupError> = {
      ok: true,
      value: mockInitialUIState as any,
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("Configured");
  });

  test("Err({ kind:'config', reason:{ kind:'unconfigured' } }) routes to 'Unconfigured'", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("Unconfigured");
  });

  test("Err({ kind:'config', reason:{ kind:'path-not-found' } }) routes to 'StartupError'", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "path-not-found", path: "/missing" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("StartupError");
  });

  test("Err({ kind:'config', reason:{ kind:'permission-denied' } }) routes to 'StartupError'", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "permission-denied", path: "/locked" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("StartupError");
  });

  test("Err({ kind:'scan', reason:{ kind:'list-failed' } }) routes to 'UnexpectedError'", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "disk error" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("UnexpectedError");
  });

  test("PROP-007: path-not-found and permission-denied both map to StartupError (not Unconfigured or UnexpectedError)", () => {
    const pathNotFound: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "path-not-found", path: "/x" } },
    };
    const permDenied: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "permission-denied", path: "/x" } },
    };
    expect(routeStartupResult(pathNotFound).state).toBe("StartupError");
    expect(routeStartupResult(permDenied).state).toBe("StartupError");
    expect(routeStartupResult(pathNotFound).state).not.toBe("Unconfigured");
    expect(routeStartupResult(permDenied).state).not.toBe("UnexpectedError");
  });

  test("'Configured' → StartupError transition: Configured never maps from error inputs", () => {
    const errUnconfigured: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
    const errScan: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "" } },
    };
    expect(routeStartupResult(errUnconfigured).state).not.toBe("Configured");
    expect(routeStartupResult(errScan).state).not.toBe("Configured");
  });

  test("scan error does NOT route to StartupError (modal must not open for scan)", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail: "" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).not.toBe("StartupError");
    expect(result.state).not.toBe("Unconfigured");
  });

  test("StartupError result carries error variant details (path-not-found path)", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "path-not-found", path: "/vault/path" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("StartupError");
    // The route result should surface the error reason for the modal
    expect(result.errorReason).toBeDefined();
  });

  // EC-01: Corrupted JSON → unconfigured (settings returns null → unconfigured)
  test("EC-01: corrupted Settings JSON → unconfigured error → Unconfigured state", () => {
    // From the pipeline, corrupted JSON manifests as unconfigured reason
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("Unconfigured");
  });

  // EC-02: PathNotFound → StartupError
  test("EC-02: path-not-found → StartupError state with path", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "path-not-found", path: "/nonexistent" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("StartupError");
  });

  // EC-03: PermissionDenied → StartupError
  test("EC-03: permission-denied → StartupError state", () => {
    const input: Result<any, AppStartupError> = {
      ok: false,
      error: { kind: "config", reason: { kind: "permission-denied", path: "/restricted" } },
    };
    const result = routeStartupResult(input);
    expect(result.state).toBe("StartupError");
  });

  // EC-13: IPC crash - no specific route test here, handled in app-shell.unit.test.ts
});

// ── AppShellState type exhaustiveness ────────────────────────────────────────

describe("REQ-002: AppShellState type is a discriminated union of exactly 5 values", () => {
  test("AppShellState union contains Loading", () => {
    const s: AppShellState = "Loading";
    expect(s).toBe("Loading");
  });

  test("AppShellState union contains Configured", () => {
    const s: AppShellState = "Configured";
    expect(s).toBe("Configured");
  });

  test("AppShellState union contains Unconfigured", () => {
    const s: AppShellState = "Unconfigured";
    expect(s).toBe("Unconfigured");
  });

  test("AppShellState union contains StartupError", () => {
    const s: AppShellState = "StartupError";
    expect(s).toBe("StartupError");
  });

  test("AppShellState union contains UnexpectedError", () => {
    const s: AppShellState = "UnexpectedError";
    expect(s).toBe("UnexpectedError");
  });
});
