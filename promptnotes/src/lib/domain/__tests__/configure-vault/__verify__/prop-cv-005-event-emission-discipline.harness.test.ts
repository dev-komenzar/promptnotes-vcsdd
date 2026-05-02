/**
 * prop-cv-005-event-emission-discipline.harness.test.ts
 *
 * PROP-CV-006: Event emission discipline — fast-check property test (Tier 1)
 *   - emit called exactly once on success path
 *   - emit called zero times on every failure variant
 *
 * REQ-001, REQ-011: success path emits exactly one VaultDirectoryConfigured
 * REQ-002 through REQ-007: all failure paths emit zero events
 *
 * FIND-006 resolution: The port name is `emit` (not `EventBus.publish`).
 * Tests assert `emit` is called via the port log.
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

function makeEmitCountDeps(
  statDirResult: Result<boolean, FsError>,
  settingsSaveResult: Result<void, FsError>,
): { deps: ConfigureVaultDeps; emitCount: { value: number }; emittedEvents: VaultDirectoryConfigured[] } {
  const emitCount = { value: 0 };
  const emittedEvents: VaultDirectoryConfigured[] = [];
  const deps: ConfigureVaultDeps = {
    vaultId: TEST_VAULT_ID,
    statDir: (_path: string) => statDirResult,
    settingsSave: (_path: VaultPath) => settingsSaveResult,
    clockNow: () => ts(1000),
    emit: (e: VaultDirectoryConfigured) => {
      emitCount.value++;
      emittedEvents.push(e);
    },
  };
  return { deps, emitCount, emittedEvents };
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

// ── PROP-CV-006: emit exactly once on success ─────────────────────────────────

describe("PROP-CV-006: emit called exactly once on success path", () => {
  test("fast-check: emit count === 1 on every successful invocation", () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (_seed) => {
          const { deps, emitCount } = makeEmitCountDeps(
            { ok: true, value: true },
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return emitCount.value === 1;
        },
      ),
      { numRuns: 100 },
    );
  });

  test("emit count === 1 and emitted event has correct kind", () => {
    const { deps, emitCount, emittedEvents } = makeEmitCountDeps(
      { ok: true, value: true },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(1);
    expect(emittedEvents[0].kind).toBe("vault-directory-configured");
  });
});

// ── PROP-CV-006: emit zero times on statDir failure ───────────────────────────

describe("PROP-CV-006: emit called zero times on every statDir failure variant", () => {
  test("fast-check: emit count === 0 for every statDir failure outcome", () => {
    fc.assert(
      fc.property(
        arbStatDirFailure,
        (statDirResult) => {
          const { deps, emitCount } = makeEmitCountDeps(
            statDirResult,
            { ok: true, value: undefined },
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return emitCount.value === 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("explicit: Ok(false) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: true, value: false },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: Err(not-found) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: false, error: { kind: "not-found" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: Err(permission) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: false, error: { kind: "permission" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: Err(disk-full) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: false, error: { kind: "disk-full" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: Err(lock) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: false, error: { kind: "lock" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: Err(unknown) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: false, error: { kind: "unknown", detail: "x" } },
      { ok: true, value: undefined },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });
});

// ── PROP-CV-006: emit zero times on settingsSave failure ──────────────────────

describe("PROP-CV-006: emit called zero times on every settingsSave failure variant", () => {
  test("fast-check: emit count === 0 for every settingsSave failure outcome", () => {
    fc.assert(
      fc.property(
        arbSettingsSaveFailure,
        (settingsSaveResult) => {
          const { deps, emitCount } = makeEmitCountDeps(
            { ok: true, value: true },
            settingsSaveResult,
          );
          configureVault(deps)({ userSelectedPath: TEST_PATH });
          return emitCount.value === 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  test("explicit: settingsSave Err(permission) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "permission" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: settingsSave Err(disk-full) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "disk-full" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: settingsSave Err(lock) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "lock" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });

  test("explicit: settingsSave Err(unknown) → emit zero times", () => {
    const { deps, emitCount } = makeEmitCountDeps(
      { ok: true, value: true },
      { ok: false, error: { kind: "unknown", detail: "store failed" } },
    );
    configureVault(deps)({ userSelectedPath: TEST_PATH });
    expect(emitCount.value).toBe(0);
  });
});
