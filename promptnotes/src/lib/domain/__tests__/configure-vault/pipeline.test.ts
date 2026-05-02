/**
 * pipeline.test.ts — Full ConfigureVault pipeline integration tests.
 *
 * REQ-001: Happy path — configureVault emits VaultDirectoryConfigured on success
 * REQ-002: statDir Ok(false) → path-not-found error
 * REQ-003: statDir Err(not-found) → path-not-found error
 * REQ-004: statDir Err(permission) → permission-denied error
 * REQ-005: statDir other FsError variants → path-not-found (collapsed)
 * REQ-006: Settings.save Err(permission) → permission-denied error
 * REQ-007: Settings.save Err(disk-full|lock|unknown) → path-not-found error
 * REQ-009: Port call ordering — statDir before Settings.save
 * REQ-010: Clock.now at-most-once on success path; never on failure paths
 * REQ-011: VaultDirectoryConfigured is a PublicDomainEvent; emit called via emit port
 * REQ-012: No mutation of in-memory vault on failure (validateAndTransitionVault not called)
 * REQ-013: I/O budget per path (spy-based call counts)
 * REQ-014: Pipeline function shape (synchronous, correct signature)
 *
 * PROP-CV-007 (Tier 0): Compile-time exhaustiveness — VaultConfigError.kind switch with never branch.
 *
 * Carry-forward from Phase 1c findings:
 * - FIND-001/009: Pipeline uses ConfigureVaultDeps (no prior Vault param); vaultId in deps
 * - FIND-005: configureVault is synchronous; tests do NOT await
 * - FIND-006: Port name is `emit`, not `EventBus.publish`
 *
 * NOTE: These imports will fail because $lib/domain/configure-vault/pipeline.ts does not
 * exist yet. That is the RED phase signal — module-load failure IS the expected failure.
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath, VaultId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";
import type { VaultDirectoryConfigured, PublicDomainEvent } from "promptnotes-domain-types/shared/events";

// RED PHASE: This import MUST FAIL — pipeline.ts does not exist yet.
import {
  configureVault,
  type ConfigureVaultDeps,
} from "$lib/domain/configure-vault/pipeline";

// ── Type-level helpers (brand cast; smart-ctor lives in Rust) ────────────────

const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;
const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

const TEST_VAULT_ID = vaultId("vault-singleton-id");
const TEST_PATH = vaultPath("/home/user/notes");

// ── Port-log helper ───────────────────────────────────────────────────────────

type PortLog = {
  statDirCalls: string[];
  settingsSaveCalls: VaultPath[];
  clockNowCalls: number;
  emittedEvents: VaultDirectoryConfigured[];
  /** Tracks call ordering by recording port name on each call */
  callOrder: string[];
};

function freshLog(): PortLog {
  return {
    statDirCalls: [],
    settingsSaveCalls: [],
    clockNowCalls: 0,
    emittedEvents: [],
    callOrder: [],
  };
}

function makeDeps(
  log: PortLog,
  opts: {
    statDirResult: Result<boolean, FsError>;
    settingsSaveResult: Result<void, FsError>;
    clockResult?: Timestamp;
  },
): ConfigureVaultDeps {
  return {
    vaultId: TEST_VAULT_ID,
    statDir: (path: string): Result<boolean, FsError> => {
      log.statDirCalls.push(path);
      log.callOrder.push("statDir");
      return opts.statDirResult;
    },
    settingsSave: (path: VaultPath): Result<void, FsError> => {
      log.settingsSaveCalls.push(path);
      log.callOrder.push("settingsSave");
      return opts.settingsSaveResult;
    },
    clockNow: (): Timestamp => {
      log.clockNowCalls += 1;
      log.callOrder.push("clockNow");
      return opts.clockResult ?? ts(9999);
    },
    emit: (event: VaultDirectoryConfigured): void => {
      log.emittedEvents.push(event);
      log.callOrder.push("emit");
    },
  };
}

// ── REQ-001: Happy Path ───────────────────────────────────────────────────────

describe("REQ-001: configureVault happy path returns Ok(VaultDirectoryConfigured)", () => {
  test("returns Ok with kind 'vault-directory-configured'", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("vault-directory-configured");
  });

  test("event path matches input VaultPath", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBe(TEST_PATH);
  });

  test("event vaultId matches the injected vaultId in deps", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.vaultId).toBe(TEST_VAULT_ID);
  });

  test("event occurredOn comes from clockNow (PROP-CV-010 / REQ-010)", () => {
    const log = freshLog();
    const sentinel = ts(99_999_999_999_999);
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
        clockResult: sentinel,
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value.occurredOn as unknown as { epochMillis: number }).epochMillis)
      .toBe(99_999_999_999_999);
  });

  test("emit is called exactly once with the returned event (REQ-009 / REQ-011)", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.emittedEvents.length).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(log.emittedEvents[0]).toEqual(result.value);
  });

  test("result is synchronous — does not return a Promise (REQ-014 / FIND-005)", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    // A Promise has a .then method; a plain Result should not.
    expect(typeof (result as unknown as { then?: unknown }).then).not.toBe("function");
  });
});

// ── REQ-002: statDir Ok(false) → path-not-found ──────────────────────────────

describe("REQ-002: statDir Ok(false) → path-not-found error", () => {
  test("returns Err with kind 'path-not-found'", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: false },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("path-not-found");
    if (result.error.kind === "path-not-found" || result.error.kind === "permission-denied") {
      expect(result.error.path).toBe("/home/user/notes");
    }
  });

  test("Settings.save is not called when statDir returns Ok(false)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: false },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.settingsSaveCalls.length).toBe(0);
  });

  test("emit is not called when statDir returns Ok(false)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: false },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.emittedEvents.length).toBe(0);
  });

  test("clockNow is not called when statDir returns Ok(false)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: false },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });
});

// ── REQ-003: statDir Err(not-found) → path-not-found ─────────────────────────

describe("REQ-003: statDir Err(not-found) → path-not-found error", () => {
  test("returns Err with kind 'path-not-found'", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "not-found" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("path-not-found");
    if (result.error.kind === "path-not-found" || result.error.kind === "permission-denied") {
      expect(result.error.path).toBe("/home/user/notes");
    }
  });

  test("Settings.save is not called", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "not-found" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.settingsSaveCalls.length).toBe(0);
  });

  test("emit is not called", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "not-found" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.emittedEvents.length).toBe(0);
  });

  test("clockNow is not called", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "not-found" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });
});

// ── REQ-004: statDir Err(permission) → permission-denied ─────────────────────

describe("REQ-004: statDir Err(permission) → permission-denied error", () => {
  test("returns Err with kind 'permission-denied'", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "permission" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("permission-denied");
    if (result.error.kind === "path-not-found" || result.error.kind === "permission-denied") {
      expect(result.error.path).toBe("/home/user/notes");
    }
  });

  test("Settings.save is not called", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "permission" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.settingsSaveCalls.length).toBe(0);
  });

  test("emit is not called", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "permission" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.emittedEvents.length).toBe(0);
  });

  test("clockNow is not called", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "permission" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });
});

// ── REQ-005: statDir other FsError → path-not-found (collapsed) ──────────────

describe("REQ-005: statDir Err(disk-full|lock|unknown) → path-not-found (collapsed)", () => {
  const collapsedErrors: FsError[] = [
    { kind: "disk-full" },
    { kind: "lock" },
    { kind: "unknown", detail: "indeterminate OS error" },
  ];

  for (const fsErr of collapsedErrors) {
    test(`statDir Err(${fsErr.kind}) → path-not-found`, () => {
      const log = freshLog();
      const result = configureVault(
        makeDeps(log, {
          statDirResult: { ok: false, error: fsErr },
          settingsSaveResult: { ok: true, value: undefined },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("path-not-found");
      if (result.error.kind === "path-not-found" || result.error.kind === "permission-denied") {
        expect(result.error.path).toBe("/home/user/notes");
      }
    });

    test(`statDir Err(${fsErr.kind}): Settings.save not called`, () => {
      const log = freshLog();
      configureVault(
        makeDeps(log, {
          statDirResult: { ok: false, error: fsErr },
          settingsSaveResult: { ok: true, value: undefined },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(log.settingsSaveCalls.length).toBe(0);
    });

    test(`statDir Err(${fsErr.kind}): emit not called`, () => {
      const log = freshLog();
      configureVault(
        makeDeps(log, {
          statDirResult: { ok: false, error: fsErr },
          settingsSaveResult: { ok: true, value: undefined },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(log.emittedEvents.length).toBe(0);
    });
  }

  test("collapsed variants do NOT produce permission-denied (negative assertion)", () => {
    for (const fsErr of collapsedErrors) {
      const log = freshLog();
      const result = configureVault(
        makeDeps(log, {
          statDirResult: { ok: false, error: fsErr },
          settingsSaveResult: { ok: true, value: undefined },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).not.toBe("permission-denied");
    }
  });
});

// ── REQ-006: Settings.save Err(permission) → permission-denied ───────────────

describe("REQ-006: Settings.save Err(permission) → permission-denied error", () => {
  test("returns Err with kind 'permission-denied'", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "permission" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("permission-denied");
    if (result.error.kind === "path-not-found" || result.error.kind === "permission-denied") {
      expect(result.error.path).toBe("/home/user/notes");
    }
  });

  test("emit is not called on Settings.save permission error", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "permission" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.emittedEvents.length).toBe(0);
  });

  test("clockNow is not called on Settings.save permission error", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "permission" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });

  test("Settings.save was invoked exactly once (statDir ran first)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "permission" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    // statDir before settingsSave ordering (REQ-009)
    expect(log.settingsSaveCalls.length).toBe(1);
    expect(log.callOrder.indexOf("statDir")).toBeLessThan(log.callOrder.indexOf("settingsSave"));
  });
});

// ── REQ-007: Settings.save Err(disk-full|lock|unknown) → path-not-found ──────

describe("REQ-007: Settings.save Err(disk-full|lock|unknown) → path-not-found error", () => {
  const settingsErrors: FsError[] = [
    { kind: "disk-full" },
    { kind: "lock" },
    { kind: "unknown", detail: "settings store unavailable" },
  ];

  for (const fsErr of settingsErrors) {
    test(`Settings.save Err(${fsErr.kind}) → path-not-found`, () => {
      const log = freshLog();
      const result = configureVault(
        makeDeps(log, {
          statDirResult: { ok: true, value: true },
          settingsSaveResult: { ok: false, error: fsErr },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("path-not-found");
      if (result.error.kind === "path-not-found" || result.error.kind === "permission-denied") {
        expect(result.error.path).toBe("/home/user/notes");
      }
    });

    test(`Settings.save Err(${fsErr.kind}): emit not called`, () => {
      const log = freshLog();
      configureVault(
        makeDeps(log, {
          statDirResult: { ok: true, value: true },
          settingsSaveResult: { ok: false, error: fsErr },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(log.emittedEvents.length).toBe(0);
    });

    test(`Settings.save Err(${fsErr.kind}): clockNow not called`, () => {
      const log = freshLog();
      configureVault(
        makeDeps(log, {
          statDirResult: { ok: true, value: true },
          settingsSaveResult: { ok: false, error: fsErr },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(log.clockNowCalls).toBe(0);
    });
  }
});

// ── REQ-009: Port call ordering ───────────────────────────────────────────────

describe("REQ-009: statDir is called before Settings.save on every path", () => {
  test("on success path: statDir index < settingsSave index in callOrder", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.callOrder.indexOf("statDir")).toBeLessThan(log.callOrder.indexOf("settingsSave"));
  });

  test("on success path: statDir is called exactly once", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.statDirCalls.length).toBe(1);
  });

  test("on success path: settingsSave is called exactly once", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.settingsSaveCalls.length).toBe(1);
  });

  test("Settings.save is called zero times on all statDir failure variants", () => {
    const statDirFailures: Result<boolean, FsError>[] = [
      { ok: true, value: false },
      { ok: false, error: { kind: "not-found" } },
      { ok: false, error: { kind: "permission" } },
      { ok: false, error: { kind: "disk-full" } },
      { ok: false, error: { kind: "lock" } },
      { ok: false, error: { kind: "unknown", detail: "x" } },
    ];

    for (const statDirResult of statDirFailures) {
      const log = freshLog();
      configureVault(
        makeDeps(log, {
          statDirResult,
          settingsSaveResult: { ok: true, value: undefined },
        }),
        { userSelectedPath: TEST_PATH },
    );

      expect(log.settingsSaveCalls.length).toBe(0);
    }
  });
});

// ── REQ-010: Clock.now discipline ─────────────────────────────────────────────

describe("REQ-010: clockNow at-most-once; only on success path; acquired after settingsSave", () => {
  test("clockNow called exactly once on success path", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(1);
  });

  test("clockNow called after settingsSave on success path", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.callOrder.indexOf("settingsSave")).toBeLessThan(log.callOrder.indexOf("clockNow"));
  });

  test("clockNow called zero times on statDir Ok(false)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: false },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });

  test("clockNow called zero times on statDir Err(permission)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "permission" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });

  test("clockNow called zero times on Settings.save Err(permission)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "permission" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });

  test("clockNow called zero times on Settings.save Err(disk-full)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "disk-full" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.clockNowCalls).toBe(0);
  });
});

// ── REQ-011: VaultDirectoryConfigured is a PublicDomainEvent ─────────────────

describe("REQ-011: VaultDirectoryConfigured is a member of PublicDomainEvent union (type-level)", () => {
  test("a VaultDirectoryConfigured value satisfies PublicDomainEvent (compile-time assertion)", () => {
    // If VaultDirectoryConfigured is not in PublicDomainEvent, the type assignment below fails to compile.
    const event: PublicDomainEvent = {
      kind: "vault-directory-configured",
      vaultId: TEST_VAULT_ID,
      path: TEST_PATH,
      occurredOn: ts(1000),
    } satisfies VaultDirectoryConfigured;
    expect(event.kind).toBe("vault-directory-configured");
  });

  test("emit port is called (not any other mechanism)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    // The emit port is the only channel: exactly one call
    expect(log.emittedEvents.length).toBe(1);
    expect(log.emittedEvents[0].kind).toBe("vault-directory-configured");
  });

  test("emit is NOT called on failure (REQ-011 negative case)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "not-found" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.emittedEvents.length).toBe(0);
  });
});

// ── REQ-012: No mutation on failure (FIND-004: validateAndTransition NOT called on save failure) ──

describe("REQ-012: validateAndTransitionVault is NOT called on Settings.save failure (FIND-004)", () => {
  // REQ-012 AC: On Settings.save failure, validateAndTransitionVault must not be called.
  // We test this indirectly via the pipeline: if validate-and-transition were called,
  // the aggregate would be mutated before persistence. Since validateAndTransitionVault
  // is a pure helper we'll import directly in validate-and-transition.test.ts, here we
  // rely on the fact that no Vault object is passed back on failure.

  test("result.ok is false on Settings.save failure (no vault was transitioned)", () => {
    const log = freshLog();
    const result = configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "disk-full" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(result.ok).toBe(false);
  });

  test("clockNow and emit are both zero on Settings.save failure (pipeline exited before transition)", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "unknown", detail: "storage unavailable" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    // If validateAndTransitionVault were called, clockNow or emit would have been called too.
    // Zero counts prove the pipeline exited before reaching the transition step.
    expect(log.clockNowCalls).toBe(0);
    expect(log.emittedEvents.length).toBe(0);
  });
});

// ── REQ-013: I/O budget table (REQ-014 shape) ────────────────────────────────

describe("REQ-013: I/O budget per path matches spec table", () => {
  test("Success: statDir=1, settingsSave=1, clockNow=1, emit=1", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.statDirCalls.length).toBe(1);
    expect(log.settingsSaveCalls.length).toBe(1);
    expect(log.clockNowCalls).toBe(1);
    expect(log.emittedEvents.length).toBe(1);
  });

  test("statDir Ok(false): statDir=1, settingsSave=0, clockNow=0, emit=0", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: false },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.statDirCalls.length).toBe(1);
    expect(log.settingsSaveCalls.length).toBe(0);
    expect(log.clockNowCalls).toBe(0);
    expect(log.emittedEvents.length).toBe(0);
  });

  test("statDir Err(permission): statDir=1, settingsSave=0, clockNow=0, emit=0", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: false, error: { kind: "permission" } },
        settingsSaveResult: { ok: true, value: undefined },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.statDirCalls.length).toBe(1);
    expect(log.settingsSaveCalls.length).toBe(0);
    expect(log.clockNowCalls).toBe(0);
    expect(log.emittedEvents.length).toBe(0);
  });

  test("Settings.save Err(*): statDir=1, settingsSave=1, clockNow=0, emit=0", () => {
    const log = freshLog();
    configureVault(
      makeDeps(log, {
        statDirResult: { ok: true, value: true },
        settingsSaveResult: { ok: false, error: { kind: "lock" } },
      }),
      { userSelectedPath: TEST_PATH },
    );

    expect(log.statDirCalls.length).toBe(1);
    expect(log.settingsSaveCalls.length).toBe(1);
    expect(log.clockNowCalls).toBe(0);
    expect(log.emittedEvents.length).toBe(0);
  });
});

// ── REQ-012 / PROP-CV-012: Event field fidelity ───────────────────────────────

describe("PROP-CV-012: VaultDirectoryConfigured field fidelity on success", () => {
  test("event fields (kind, vaultId, path, occurredOn) are all correct", () => {
    const sentinelTs = ts(42_000);
    const customPath = vaultPath("/vault/path");
    const customId = vaultId("custom-vault");
    const log = freshLog();

    const deps: ConfigureVaultDeps = {
      vaultId: customId,
      statDir: () => ({ ok: true, value: true }),
      settingsSave: () => ({ ok: true, value: undefined }),
      clockNow: () => sentinelTs,
      emit: (e) => log.emittedEvents.push(e),
    };

    const result = configureVault(deps, { userSelectedPath: customPath });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("vault-directory-configured");
    expect(result.value.vaultId).toBe(customId);
    expect(result.value.path).toBe(customPath);
    expect((result.value.occurredOn as unknown as { epochMillis: number }).epochMillis).toBe(42_000);
  });
});

// ── PROP-CV-007 (Tier 0): Compile-time exhaustiveness check ──────────────────

describe("PROP-CV-007 (Tier 0): VaultConfigError switch exhaustiveness with never branch", () => {
  test("all VaultConfigError.kind variants are handled; never branch is unreachable", () => {
    // This test exists purely to confirm the switch compiles without error.
    // At runtime it always passes. The type system enforces exhaustiveness.
    function handleError(e: VaultConfigError): string {
      switch (e.kind) {
        case "unconfigured":
          return "unconfigured";
        case "path-not-found":
          return `path-not-found:${e.path}`;
        case "permission-denied":
          return `permission-denied:${e.path}`;
        default: {
          // If TypeScript reaches here, it means a new variant was added
          // to VaultConfigError without updating this switch.
          const _exhaustive: never = e;
          return `unknown:${(_exhaustive as { kind: string }).kind}`;
        }
      }
    }

    const err: VaultConfigError = { kind: "path-not-found", path: "/tmp" };
    expect(handleError(err)).toBe("path-not-found:/tmp");

    const err2: VaultConfigError = { kind: "permission-denied", path: "/tmp" };
    expect(handleError(err2)).toBe("permission-denied:/tmp");

    const err3: VaultConfigError = { kind: "unconfigured" };
    expect(handleError(err3)).toBe("unconfigured");
  });

  test("configureVault never produces unconfigured error variant", () => {
    // The pipeline cannot produce 'unconfigured'; that variant comes from AppStartup only.
    const allStatDirOutcomes: Result<boolean, FsError>[] = [
      { ok: true, value: false },
      { ok: false, error: { kind: "not-found" } },
      { ok: false, error: { kind: "permission" } },
      { ok: false, error: { kind: "disk-full" } },
      { ok: false, error: { kind: "lock" } },
      { ok: false, error: { kind: "unknown", detail: "x" } },
    ];

    const allSettingsSaveOutcomes: Result<void, FsError>[] = [
      { ok: false, error: { kind: "permission" } },
      { ok: false, error: { kind: "disk-full" } },
      { ok: false, error: { kind: "lock" } },
      { ok: false, error: { kind: "unknown", detail: "x" } },
    ];

    for (const statDirResult of allStatDirOutcomes) {
      const result = configureVault({
        vaultId: TEST_VAULT_ID,
        statDir: () => statDirResult,
        settingsSave: () => ({ ok: true, value: undefined }),
        clockNow: () => ts(1000),
        emit: () => {},
      }, { userSelectedPath: TEST_PATH });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).not.toBe("unconfigured");
      }
    }

    for (const settingsSaveResult of allSettingsSaveOutcomes) {
      const result = configureVault({
        vaultId: TEST_VAULT_ID,
        statDir: () => ({ ok: true, value: true }),
        settingsSave: () => settingsSaveResult,
        clockNow: () => ts(1000),
        emit: () => {},
      }, { userSelectedPath: TEST_PATH });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).not.toBe("unconfigured");
      }
    }
  });
});
