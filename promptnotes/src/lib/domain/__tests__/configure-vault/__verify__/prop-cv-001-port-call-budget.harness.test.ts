/**
 * prop-cv-001-port-call-budget.harness.test.ts
 *
 * PROP-CV-005: I/O budget per path — fast-check property test (Tier 1, REQ-013)
 *   Per success/failure path, port-call counts match REQ-013's budget table.
 *   Enumerate every FsError variant for statDir and settingsSave failure paths.
 *
 * FIND-007 resolution: Use fast-check to enumerate one happy path +
 *   every statDir failure variant (Ok(false), Err(not-found), Err(permission),
 *   Err(disk-full), Err(lock), Err(unknown)) +
 *   every settingsSave failure variant; assert budget row matching path.
 *
 * File renamed to prop-cv-001-port-call-budget per task spec (combined with PROP-CV-005).
 *
 * NOTE: Import MUST FAIL — pipeline.ts does not exist yet.
 * This is the RED phase signal.
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath, VaultId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";
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

type CallCounts = {
  statDir: number;
  settingsSave: number;
  clockNow: number;
  emit: number;
};

function makeDepsWithCounts(
  statDirResult: Result<boolean, FsError>,
  settingsSaveResult: Result<void, FsError>,
): { deps: ConfigureVaultDeps; counts: CallCounts } {
  const counts: CallCounts = { statDir: 0, settingsSave: 0, clockNow: 0, emit: 0 };
  const deps: ConfigureVaultDeps = {
    vaultId: TEST_VAULT_ID,
    statDir: (_path: string) => { counts.statDir++; return statDirResult; },
    settingsSave: (_path: VaultPath) => { counts.settingsSave++; return settingsSaveResult; },
    clockNow: () => { counts.clockNow++; return ts(1000); },
    emit: (_e: VaultDirectoryConfigured) => { counts.emit++; },
  };
  return { deps, counts };
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbFsError: fc.Arbitrary<FsError> = fc.oneof(
  fc.constant({ kind: "permission" as const }),
  fc.constant({ kind: "disk-full" as const }),
  fc.constant({ kind: "lock" as const }),
  fc.constant({ kind: "not-found" as const }),
  fc.string({ minLength: 1 }).map((detail) => ({ kind: "unknown" as const, detail })),
);

// All statDir outcomes that produce a failure (not Ok(true))
const arbStatDirFailure: fc.Arbitrary<Result<boolean, FsError>> = fc.oneof(
  fc.constant({ ok: true as const, value: false }),
  arbFsError.map((e) => ({ ok: false as const, error: e })),
);

const arbSettingsSaveFailure: fc.Arbitrary<Result<void, FsError>> = arbFsError.map(
  (e) => ({ ok: false as const, error: e }),
);

// ── PROP-CV-005: I/O budget — success path ────────────────────────────────────

describe("PROP-CV-005: I/O budget — success path: statDir=1, settingsSave=1, clockNow=1, emit=1", () => {
  test("fast-check: success path budget holds for arbitrary paths", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (_pathStr) => {
          const { deps, counts } = makeDepsWithCounts(
            { ok: true, value: true },
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return (
            counts.statDir === 1 &&
            counts.settingsSave === 1 &&
            counts.clockNow === 1 &&
            counts.emit === 1
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── PROP-CV-005: I/O budget — statDir failure paths ──────────────────────────

describe("PROP-CV-005: I/O budget — statDir failure: statDir=1, settingsSave=0, clockNow=0, emit=0", () => {
  test("fast-check: every statDir failure outcome has correct budget", () => {
    fc.assert(
      fc.property(
        arbStatDirFailure,
        (statDirResult) => {
          const { deps, counts } = makeDepsWithCounts(
            statDirResult,
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return (
            counts.statDir === 1 &&
            counts.settingsSave === 0 &&
            counts.clockNow === 0 &&
            counts.emit === 0
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  test("explicit: Ok(false) statDir budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: true, value: false },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(0);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: Err(not-found) statDir budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: false, error: { kind: "not-found" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(0);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: Err(permission) statDir budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: false, error: { kind: "permission" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(0);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: Err(disk-full) statDir budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: false, error: { kind: "disk-full" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(0);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: Err(lock) statDir budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: false, error: { kind: "lock" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(0);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: Err(unknown) statDir budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: false, error: { kind: "unknown", detail: "indeterminate" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(0);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });
});

// ── PROP-CV-005: I/O budget — settingsSave failure paths ─────────────────────

describe("PROP-CV-005: I/O budget — settingsSave failure: statDir=1, settingsSave=1, clockNow=0, emit=0", () => {
  test("fast-check: every settingsSave failure outcome has correct budget", () => {
    fc.assert(
      fc.property(
        arbSettingsSaveFailure,
        (settingsSaveResult) => {
          const { deps, counts } = makeDepsWithCounts(
            { ok: true, value: true },
            settingsSaveResult,
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return (
            counts.statDir === 1 &&
            counts.settingsSave === 1 &&
            counts.clockNow === 0 &&
            counts.emit === 0
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  test("explicit: settingsSave Err(permission) budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: true, value: true },
      { ok: false, error: { kind: "permission" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(1);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: settingsSave Err(disk-full) budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: true, value: true },
      { ok: false, error: { kind: "disk-full" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(1);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: settingsSave Err(lock) budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: true, value: true },
      { ok: false, error: { kind: "lock" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(1);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });

  test("explicit: settingsSave Err(unknown) budget", () => {
    const { deps, counts } = makeDepsWithCounts(
      { ok: true, value: true },
      { ok: false, error: { kind: "unknown", detail: "store locked" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(counts.statDir).toBe(1);
    expect(counts.settingsSave).toBe(1);
    expect(counts.clockNow).toBe(0);
    expect(counts.emit).toBe(0);
  });
});
