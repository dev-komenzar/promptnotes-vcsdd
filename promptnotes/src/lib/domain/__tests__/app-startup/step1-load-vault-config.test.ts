/**
 * step1-load-vault-config.test.ts — Step 1: loadVaultConfig tests
 *
 * REQ-001: Happy path — loads VaultPath and verifies directory existence
 * REQ-003: Unconfigured — Settings.load() returns null
 * REQ-004: PathNotFound — statDir returns Ok(false) or Err(not-found)
 * REQ-005: PermissionDenied — statDir returns Err(permission)
 * REQ-006: null Settings.load maps to Unconfigured (not PathNotFound)
 *
 * PROP-005: null → unconfigured (not path-not-found)
 * PROP-006: PathNotFound requires non-null path
 * PROP-007: PermissionDenied requires non-null path
 * PROP-014: VaultDirectoryNotConfigured emitted exactly once on Unconfigured
 * PROP-016: Happy-path Step 1 emits NO domain event
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { VaultDirectoryNotConfigured } from "promptnotes-domain-types/shared/events";
import type { ConfiguredVault } from "$lib/domain/app-startup/stages";

// The implementation does NOT exist yet. This import will fail, which
// is the Red phase evidence.
import {
  loadVaultConfig,
  type LoadVaultConfigPorts,
} from "$lib/domain/app-startup/load-vault-config";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeVaultPath(raw: string): VaultPath {
  // Cast for test setup; Smart Constructor validation is a Phase 2b concern.
  return raw as unknown as VaultPath;
}

function makeSettingsLoad(result: VaultPath | null) {
  return () => ({ ok: true as const, value: result });
}

function makeStatDir(result: Result<boolean, { kind: "permission" | "not-found"; path?: string }>) {
  return (_path: string) => result;
}

type EmittedEvents = Array<{ kind: string }>;

function makeEventSpy(): { events: EmittedEvents; emit: (e: { kind: string }) => void } {
  const events: EmittedEvents = [];
  return {
    events,
    emit: (e) => events.push(e),
  };
}

// ── REQ-001 / PROP-016 ────────────────────────────────────────────────────

describe("REQ-001: Happy path — Step 1 produces ConfiguredVault", () => {
  test("PROP-016: emits NO domain event on happy path", async () => {
    // REQ-001 AC: No domain event of any kind is emitted during successful Step 1.
    const spy = makeEventSpy();
    const vaultPath = makeVaultPath("/home/user/vault");

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: true, value: true }),
      emit: spy.emit,
    };

    await loadVaultConfig(ports);

    // PROP-016: No VaultDirectoryConfigured, no VaultDirectoryNotConfigured
    expect(spy.events).toHaveLength(0);
  });

  test("happy path returns Ok(ConfiguredVault) with verified VaultPath", async () => {
    // REQ-001 AC: ConfiguredVault carries the verified VaultPath.
    const vaultPath = makeVaultPath("/home/user/vault");
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: true, value: true }),
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("ConfiguredVault");
      expect(result.value.vaultPath).toBe(vaultPath);
    }
  });
});

// ── REQ-003 / REQ-006 / PROP-005 / PROP-014 ─────────────────────────────

describe("REQ-003 / REQ-006 / PROP-005: null Settings.load → Unconfigured", () => {
  test("PROP-005: null Settings.load produces unconfigured error (not path-not-found)", async () => {
    // REQ-006: Null return is the sole trigger for unconfigured.
    // REQ-006 AC: PathNotFound is NEVER produced from a null path.
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(null),
      statDir: makeStatDir({ ok: true, value: true }), // statDir should NOT be called
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config");
      if (result.error.kind === "config") {
        // PROP-005: must be unconfigured, NOT path-not-found
        expect(result.error.reason.kind).toBe("unconfigured");
        expect(result.error.reason.kind).not.toBe("path-not-found");
      }
    }
  });

  test("PROP-014: VaultDirectoryNotConfigured emitted exactly once on Unconfigured", async () => {
    // REQ-003 AC: VaultDirectoryNotConfigured {occurredOn: Timestamp} emitted exactly once.
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(null),
      statDir: makeStatDir({ ok: true, value: true }),
      emit: spy.emit,
    };

    await loadVaultConfig(ports);

    const notConfiguredEvents = spy.events.filter(
      (e) => e.kind === "vault-directory-not-configured"
    );
    expect(notConfiguredEvents).toHaveLength(1);

    const evt = notConfiguredEvents[0] as VaultDirectoryNotConfigured;
    expect(evt.kind).toBe("vault-directory-not-configured");
    expect("occurredOn" in evt).toBe(true);
  });

  test("REQ-003: no further steps execute after Unconfigured", async () => {
    // REQ-003 AC: Steps 2, 3, 4 are not executed; InitialUIState is NOT produced.
    const statDirCallCount = { count: 0 };
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(null),
      statDir: (_path) => {
        statDirCallCount.count++;
        return { ok: true, value: true };
      },
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    // statDir must NOT be called when Settings.load returns null
    expect(statDirCallCount.count).toBe(0);
    expect(result.ok).toBe(false);
  });

  test("PROP-016 complement: VaultDirectoryNotConfigured is NOT emitted on happy path", async () => {
    // REQ-001 AC: VaultDirectoryNotConfigured is for Unconfigured only.
    const spy = makeEventSpy();
    const vaultPath = makeVaultPath("/home/user/vault");

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: true, value: true }),
      emit: spy.emit,
    };

    await loadVaultConfig(ports);

    const notConfiguredEvents = spy.events.filter(
      (e) => e.kind === "vault-directory-not-configured"
    );
    expect(notConfiguredEvents).toHaveLength(0);
  });
});

// ── REQ-004 / PROP-006 ────────────────────────────────────────────────────

describe("REQ-004 / PROP-006: statDir → Ok(false) or Err(not-found) → PathNotFound", () => {
  test("statDir Ok(false) → path-not-found error with path", async () => {
    // REQ-004 AC: AppStartupError.reason.path contains the configured path string.
    // F-005: Ok(false) means exists-as-file, not a directory — maps to PathNotFound.
    const vaultPath = makeVaultPath("/home/user/vault");
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: true, value: false }), // Ok(false) = not a directory
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config");
      if (result.error.kind === "config") {
        expect(result.error.reason.kind).toBe("path-not-found");
        if (result.error.reason.kind === "path-not-found") {
          expect(result.error.reason.path).toBe("/home/user/vault");
        }
      }
    }
  });

  test("statDir Err(not-found) → path-not-found error with path", async () => {
    // F-005: both Ok(false) and Err(not-found) → PathNotFound.
    const vaultPath = makeVaultPath("/home/user/vault");
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: false, error: { kind: "not-found" } }),
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config");
      if (result.error.kind === "config") {
        expect(result.error.reason.kind).toBe("path-not-found");
      }
    }
  });

  test("PROP-006: PathNotFound requires non-null path — null path never triggers it", async () => {
    // REQ-006 AC: PathNotFound is never produced from a null path.
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(null), // null → must produce unconfigured
      statDir: makeStatDir({ ok: true, value: false }),
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "config") {
      expect(result.error.reason.kind).not.toBe("path-not-found");
      expect(result.error.reason.kind).toBe("unconfigured");
    }
  });

  test("REQ-004: no VaultDirectoryNotConfigured emitted on PathNotFound", async () => {
    // REQ-004 AC: That event is reserved for the unconfigured case.
    const spy = makeEventSpy();
    const vaultPath = makeVaultPath("/no/such/dir");

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: true, value: false }),
      emit: spy.emit,
    };

    await loadVaultConfig(ports);

    const notConfiguredEvents = spy.events.filter(
      (e) => e.kind === "vault-directory-not-configured"
    );
    expect(notConfiguredEvents).toHaveLength(0);
  });
});

// ── REQ-005 / PROP-007 ────────────────────────────────────────────────────

describe("REQ-005 / PROP-007: statDir Err(permission) → PermissionDenied", () => {
  test("statDir Err(permission) → permission-denied error with path", async () => {
    // REQ-005 AC: AppStartupError.reason.path contains the configured path string.
    const vaultPath = makeVaultPath("/root/secret");
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: makeStatDir({ ok: false, error: { kind: "permission" } }),
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("config");
      if (result.error.kind === "config") {
        expect(result.error.reason.kind).toBe("permission-denied");
        if (result.error.reason.kind === "permission-denied") {
          expect(result.error.reason.path).toBe("/root/secret");
        }
      }
    }
  });

  test("PROP-007: PermissionDenied requires non-null path", async () => {
    // REQ-006 / REQ-005: null path always → unconfigured, never permission-denied.
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(null),
      statDir: makeStatDir({ ok: false, error: { kind: "permission" } }),
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "config") {
      expect(result.error.reason.kind).not.toBe("permission-denied");
      expect(result.error.reason.kind).toBe("unconfigured");
    }
  });

  test("REQ-005: no further steps execute after PermissionDenied", async () => {
    // REQ-005 AC: No further steps are executed.
    const vaultPath = makeVaultPath("/root/secret");
    let statDirCallCount = 0;
    const spy = makeEventSpy();

    const ports: LoadVaultConfigPorts = {
      settingsLoad: makeSettingsLoad(vaultPath),
      statDir: (_path) => {
        statDirCallCount++;
        return { ok: false, error: { kind: "permission" as const } };
      },
      emit: spy.emit,
    };

    const result = await loadVaultConfig(ports);

    expect(result.ok).toBe(false);
    // statDir called exactly once (to verify the path)
    expect(statDirCallCount).toBe(1);
  });
});
