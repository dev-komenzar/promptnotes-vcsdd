/**
 * prop-cv-008-ordering.harness.test.ts
 *
 * PROP-CV-008: Port-call ordering — fast-check property test (Tier 1)
 *   - When statDir fails: settingsSave is NEVER called (REQ-009)
 *   - When statDir fails: validateAndTransitionVault is NEVER called (FIND-004)
 *   - When settingsSave fails: validateAndTransitionVault is NEVER called (REQ-012 / FIND-004)
 *
 * FIND-004 resolution: This harness verifies that validateAndTransitionVault
 * is not invoked on any failure path. We detect this indirectly via the
 * absence of clockNow and emit calls (the pipeline cannot reach those
 * without calling validateAndTransitionVault).
 *
 * For direct validateAndTransitionVault call detection, we use a spy
 * that counts invocations by replacing the import — but since the
 * implementation doesn't exist yet, we rely on the port-call side effects:
 * clockNow and emit are only called after validateAndTransitionVault on the
 * success path. Zero clockNow + zero emit proves no transition occurred.
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

type OrderingLog = {
  callOrder: string[];
  settingsSaveCalls: number;
  clockNowCalls: number;
  emitCalls: number;
};

function makeOrderingDeps(
  statDirResult: Result<boolean, FsError>,
  settingsSaveResult: Result<void, FsError>,
): { deps: ConfigureVaultDeps; log: OrderingLog } {
  const log: OrderingLog = {
    callOrder: [],
    settingsSaveCalls: 0,
    clockNowCalls: 0,
    emitCalls: 0,
  };

  const deps: ConfigureVaultDeps = {
    vaultId: TEST_VAULT_ID,
    statDir: (_path: string) => {
      log.callOrder.push("statDir");
      return statDirResult;
    },
    settingsSave: (_path: VaultPath) => {
      log.settingsSaveCalls++;
      log.callOrder.push("settingsSave");
      return settingsSaveResult;
    },
    clockNow: () => {
      log.clockNowCalls++;
      log.callOrder.push("clockNow");
      return ts(1000);
    },
    emit: (_e: VaultDirectoryConfigured) => {
      log.emitCalls++;
      log.callOrder.push("emit");
    },
  };

  return { deps, log };
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbFsError: fc.Arbitrary<FsError> = fc.oneof(
  fc.constant({ kind: "permission" as const }),
  fc.constant({ kind: "disk-full" as const }),
  fc.constant({ kind: "lock" as const }),
  fc.constant({ kind: "not-found" as const }),
  fc.string({ minLength: 1 }).map((detail) => ({ kind: "unknown" as const, detail })),
);

const arbStatDirFailure: fc.Arbitrary<Result<boolean, FsError>> = fc.oneof(
  fc.constant({ ok: true as const, value: false }),
  arbFsError.map((e) => ({ ok: false as const, error: e })),
);

const arbSettingsSaveFailure: fc.Arbitrary<Result<void, FsError>> = arbFsError.map(
  (e) => ({ ok: false as const, error: e }),
);

// ── PROP-CV-008: When statDir fails, settingsSave is NEVER called ─────────────

describe("PROP-CV-008: settingsSave is NEVER called when statDir does not return Ok(true)", () => {
  test("fast-check: settingsSaveCalls === 0 for every statDir failure outcome", () => {
    fc.assert(
      fc.property(
        arbStatDirFailure,
        (statDirResult) => {
          const { deps, log } = makeOrderingDeps(
            statDirResult,
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return log.settingsSaveCalls === 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("fast-check: statDir appears before settingsSave in callOrder on success", () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (_seed) => {
          const { deps, log } = makeOrderingDeps(
            { ok: true, value: true },
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          const statDirIdx = log.callOrder.indexOf("statDir");
          const settingsSaveIdx = log.callOrder.indexOf("settingsSave");
          return statDirIdx !== -1 && settingsSaveIdx !== -1 && statDirIdx < settingsSaveIdx;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── FIND-004: When statDir fails, validateAndTransitionVault is NEVER called ──

describe("FIND-004 / REQ-012: validateAndTransitionVault is NEVER called when statDir fails", () => {
  // We detect this indirectly: validateAndTransitionVault is only called on the
  // success path, after clockNow. If clockNow === 0, transition was never called.
  test("fast-check: clockNow === 0 (transition not called) when statDir fails", () => {
    fc.assert(
      fc.property(
        arbStatDirFailure,
        (statDirResult) => {
          const { deps, log } = makeOrderingDeps(
            statDirResult,
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          // clockNow is gated to after validateAndTransitionVault on the success path.
          // Zero clockNow implies the pipeline never reached the transition step.
          return log.clockNowCalls === 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("fast-check: emit === 0 (transition not called) when statDir fails", () => {
    fc.assert(
      fc.property(
        arbStatDirFailure,
        (statDirResult) => {
          const { deps, log } = makeOrderingDeps(
            statDirResult,
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return log.emitCalls === 0;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── FIND-004: When settingsSave fails, validateAndTransitionVault is NEVER called ──

describe("FIND-004 / REQ-012: validateAndTransitionVault is NEVER called when settingsSave fails", () => {
  test("fast-check: clockNow === 0 (transition not called) when settingsSave fails", () => {
    fc.assert(
      fc.property(
        arbSettingsSaveFailure,
        (settingsSaveResult) => {
          const { deps, log } = makeOrderingDeps(
            { ok: true, value: true },
            settingsSaveResult,
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return log.clockNowCalls === 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("fast-check: emit === 0 (transition not called) when settingsSave fails", () => {
    fc.assert(
      fc.property(
        arbSettingsSaveFailure,
        (settingsSaveResult) => {
          const { deps, log } = makeOrderingDeps(
            { ok: true, value: true },
            settingsSaveResult,
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return log.emitCalls === 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("explicit: settingsSave Err(permission) — clockNow=0 and emit=0", () => {
    const { deps, log } = makeOrderingDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "permission" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(log.clockNowCalls).toBe(0);
    expect(log.emitCalls).toBe(0);
  });

  test("explicit: settingsSave Err(disk-full) — clockNow=0 and emit=0", () => {
    const { deps, log } = makeOrderingDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "disk-full" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(log.clockNowCalls).toBe(0);
    expect(log.emitCalls).toBe(0);
  });

  test("explicit: settingsSave Err(lock) — clockNow=0 and emit=0", () => {
    const { deps, log } = makeOrderingDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "lock" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(log.clockNowCalls).toBe(0);
    expect(log.emitCalls).toBe(0);
  });

  test("explicit: settingsSave Err(unknown) — clockNow=0 and emit=0", () => {
    const { deps, log } = makeOrderingDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "unknown", detail: "store failed" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(log.clockNowCalls).toBe(0);
    expect(log.emitCalls).toBe(0);
  });
});

// ── REQ-009 combined: ordering proof on success path ─────────────────────────

describe("REQ-009: call order on success path is statDir → settingsSave → clockNow → emit", () => {
  test("callOrder on success path is exactly [statDir, settingsSave, clockNow, emit]", () => {
    const { deps, log } = makeOrderingDeps(
      { ok: true, value: true },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(log.callOrder).toEqual(["statDir", "settingsSave", "clockNow", "emit"]);
  });

  test("on statDir failure: callOrder is exactly [statDir] (nothing else runs)", () => {
    const statDirFailures: Result<boolean, FsError>[] = [
      { ok: true, value: false },
      { ok: false, error: { kind: "not-found" } },
      { ok: false, error: { kind: "permission" } },
      { ok: false, error: { kind: "disk-full" } },
    ];

    for (const statDirResult of statDirFailures) {
      const { deps, log } = makeOrderingDeps(statDirResult, { ok: true, value: undefined });
      configureVault(deps)({ userSelectedPath: TEST_PATH });
      expect(log.callOrder).toEqual(["statDir"]);
    }
  });

  test("on settingsSave failure: callOrder is exactly [statDir, settingsSave] (clockNow/emit don't run)", () => {
    const settingsSaveFailures: Result<void, FsError>[] = [
      { ok: false, error: { kind: "permission" } },
      { ok: false, error: { kind: "disk-full" } },
      { ok: false, error: { kind: "lock" } },
      { ok: false, error: { kind: "unknown", detail: "x" } },
    ];

    for (const settingsSaveResult of settingsSaveFailures) {
      const { deps, log } = makeOrderingDeps({ ok: true, value: true }, settingsSaveResult);
      configureVault(deps)({ userSelectedPath: TEST_PATH });
      expect(log.callOrder).toEqual(["statDir", "settingsSave"]);
    }
  });
});
