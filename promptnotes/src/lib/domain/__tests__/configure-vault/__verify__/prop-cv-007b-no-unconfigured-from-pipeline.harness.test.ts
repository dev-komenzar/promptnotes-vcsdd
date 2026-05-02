/**
 * prop-cv-007b-no-unconfigured-from-pipeline.harness.test.ts
 *
 * PROP-CV-007b (Tier 1): Runtime invariant — configureVault NEVER produces
 * a VaultConfigError with kind === "unconfigured".
 *
 * FIND-003 resolution: Split from PROP-CV-007 (compile-time Tier 0).
 * This harness covers the runtime claim using fast-check over
 * statDir × settingsSave outcome cross-product.
 *
 * The "unconfigured" variant is produced ONLY by AppStartup/loadVaultConfig
 * when Settings.load() returns null. The ConfigureVault pipeline starts
 * after the user has selected a path — "unconfigured" is unreachable by design.
 *
 * NOTE: Import MUST FAIL — pipeline.ts does not exist yet.
 * This is the RED phase signal.
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath, VaultId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { VaultDirectoryConfigured } from "promptnotes-domain-types/shared/events";

// RED PHASE: This import MUST FAIL — pipeline.ts does not exist yet.
import {
  configureVault,
  type ConfigureVaultDeps,
} from "$lib/domain/configure-vault/pipeline";

// ── Helpers ───────────────────────────────────────────────────────────────────

const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;
const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

const TEST_VAULT_ID = vaultId("vault-singleton");
const TEST_PATH = vaultPath("/test/path");

function makeNullDeps(
  statDirResult: Result<boolean, FsError>,
  settingsSaveResult: Result<void, FsError>,
): ConfigureVaultDeps {
  return {
    vaultId: TEST_VAULT_ID,
    statDir: (_path: string) => statDirResult,
    settingsSave: (_path: VaultPath) => settingsSaveResult,
    clockNow: () => ts(1000),
    emit: (_e: VaultDirectoryConfigured) => {},
  };
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbFsError: fc.Arbitrary<FsError> = fc.oneof(
  fc.constant({ kind: "permission" as const }),
  fc.constant({ kind: "disk-full" as const }),
  fc.constant({ kind: "lock" as const }),
  fc.constant({ kind: "not-found" as const }),
  fc.string({ minLength: 1 }).map((detail) => ({ kind: "unknown" as const, detail })),
);

// All statDir outcomes (both success and failure)
const arbStatDirResult: fc.Arbitrary<Result<boolean, FsError>> = fc.oneof(
  fc.constant({ ok: true as const, value: true }),
  fc.constant({ ok: true as const, value: false }),
  arbFsError.map((e) => ({ ok: false as const, error: e })),
);

// All settingsSave outcomes
const arbSettingsSaveResult: fc.Arbitrary<Result<void, FsError>> = fc.oneof(
  fc.constant({ ok: true as const, value: undefined }),
  arbFsError.map((e) => ({ ok: false as const, error: e })),
);

// ── PROP-CV-007b: No unconfigured error from pipeline ─────────────────────────

describe("PROP-CV-007b: configureVault never produces VaultConfigError { kind: 'unconfigured' }", () => {
  test("fast-check: no error from configureVault has kind === 'unconfigured' (statDir cross-product)", () => {
    fc.assert(
      fc.property(
        arbStatDirResult,
        (statDirResult) => {
          const deps = makeNullDeps(statDirResult, { ok: true, value: undefined });
          const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
          if (result.ok) return true;
          return result.error.kind !== "unconfigured";
        },
      ),
      { numRuns: 300 },
    );
  });

  test("fast-check: no error from configureVault has kind === 'unconfigured' (settingsSave cross-product)", () => {
    fc.assert(
      fc.property(
        arbSettingsSaveResult,
        (settingsSaveResult) => {
          const deps = makeNullDeps({ ok: true, value: true }, settingsSaveResult);
          const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
          if (result.ok) return true;
          return result.error.kind !== "unconfigured";
        },
      ),
      { numRuns: 300 },
    );
  });

  test("fast-check: no error from configureVault has kind === 'unconfigured' (full cross-product)", () => {
    fc.assert(
      fc.property(
        arbStatDirResult,
        arbSettingsSaveResult,
        (statDirResult, settingsSaveResult) => {
          const deps = makeNullDeps(statDirResult, settingsSaveResult);
          const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
          if (result.ok) return true;
          return result.error.kind !== "unconfigured";
        },
      ),
      { numRuns: 500 },
    );
  });

  test("explicit: statDir Ok(false) → never unconfigured", () => {
    const deps = makeNullDeps({ ok: true, value: false }, { ok: true, value: undefined });
    const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).not.toBe("unconfigured");
    }
  });

  test("explicit: statDir Err(not-found) → never unconfigured", () => {
    const deps = makeNullDeps(
      { ok: false, error: { kind: "not-found" } },
      { ok: true, value: undefined },
    );
    const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).not.toBe("unconfigured");
    }
  });

  test("explicit: statDir Err(permission) → never unconfigured", () => {
    const deps = makeNullDeps(
      { ok: false, error: { kind: "permission" } },
      { ok: true, value: undefined },
    );
    const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).not.toBe("unconfigured");
    }
  });

  test("explicit: statDir Err(disk-full) → never unconfigured", () => {
    const deps = makeNullDeps(
      { ok: false, error: { kind: "disk-full" } },
      { ok: true, value: undefined },
    );
    const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).not.toBe("unconfigured");
    }
  });

  test("explicit: settingsSave Err(permission) → never unconfigured", () => {
    const deps = makeNullDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "permission" } },
    );
    const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).not.toBe("unconfigured");
    }
  });

  test("explicit: settingsSave Err(disk-full) → never unconfigured", () => {
    const deps = makeNullDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "disk-full" } },
    );
    const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).not.toBe("unconfigured");
    }
  });

  test("only path-not-found and permission-denied are produced by configureVault errors", () => {
    const allFailurePairs: Array<[Result<boolean, FsError>, Result<void, FsError>]> = [
      [{ ok: true, value: false }, { ok: true, value: undefined }],
      [{ ok: false, error: { kind: "not-found" } }, { ok: true, value: undefined }],
      [{ ok: false, error: { kind: "permission" } }, { ok: true, value: undefined }],
      [{ ok: false, error: { kind: "disk-full" } }, { ok: true, value: undefined }],
      [{ ok: false, error: { kind: "lock" } }, { ok: true, value: undefined }],
      [{ ok: false, error: { kind: "unknown", detail: "x" } }, { ok: true, value: undefined }],
      [{ ok: true, value: true }, { ok: false, error: { kind: "permission" } }],
      [{ ok: true, value: true }, { ok: false, error: { kind: "disk-full" } }],
      [{ ok: true, value: true }, { ok: false, error: { kind: "lock" } }],
      [{ ok: true, value: true }, { ok: false, error: { kind: "unknown", detail: "x" } }],
    ];

    for (const [statDirResult, settingsSaveResult] of allFailurePairs) {
      const deps = makeNullDeps(statDirResult, settingsSaveResult);
      const result = configureVault(deps)({ userSelectedPath: TEST_PATH });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const validErrorKinds = ["path-not-found", "permission-denied"];
        expect(validErrorKinds).toContain(result.error.kind);
        expect(result.error.kind).not.toBe("unconfigured");
      }
    }
  });
});
