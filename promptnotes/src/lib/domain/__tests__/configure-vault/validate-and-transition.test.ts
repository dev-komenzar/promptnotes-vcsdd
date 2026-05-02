/**
 * validate-and-transition.test.ts — Pure helper validateAndTransitionVault
 *
 * REQ-008: Vault aggregate state transition is pure
 *   - (VaultId, VaultPath, Timestamp) → Vault in Ready status
 *   - No I/O, deterministic, no ports
 *   - Same inputs always produce structurally identical output
 * PROP-CV-004: validateAndTransitionVault is pure (Tier 1)
 * PROP-CV-011: Repeat configure (Ready → Ready with new path) (Tier 2)
 *
 * Carry-forward FIND-001: The function does NOT accept a prior Vault parameter.
 * The function simply returns Vault { id, status: Ready { path, last_scanned_at: None } }.
 * Idempotency is that calling with any (vaultId, path, now) always produces Ready.
 *
 * NOTE: Import MUST FAIL — validate-and-transition.ts does not exist yet.
 * This is the RED phase signal.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPath, VaultId, Timestamp } from "promptnotes-domain-types/shared/value-objects";

// RED PHASE: This import MUST FAIL — validate-and-transition.ts does not exist yet.
import { validateAndTransitionVault } from "$lib/domain/configure-vault/validate-and-transition";

// ── Type-level helpers ────────────────────────────────────────────────────────

const vaultPath = (s: string): VaultPath => s as unknown as VaultPath;
const vaultId = (s: string): VaultId => s as unknown as VaultId;
const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

const TEST_ID = vaultId("vault-singleton-id");
const TEST_PATH = vaultPath("/home/user/notes");
const TEST_TS = ts(1_000_000);

// ── Vault type mirror (TS side — matches Rust aggregate.rs) ──────────────────
// The Vault aggregate type is not yet in the domain-types package.
// We define a structural mirror here for test assertions.

type VaultStatusReady = { kind: "Ready"; path: VaultPath; last_scanned_at: null | Timestamp };
type VaultStatusUnconfigured = { kind: "Unconfigured" };
type VaultStatus = VaultStatusReady | VaultStatusUnconfigured;
type VaultAggregate = { id: VaultId; status: VaultStatus };

// ── REQ-008: Returns Vault with Ready status ──────────────────────────────────

describe("REQ-008: validateAndTransitionVault returns Vault in Ready status", () => {
  test("status.kind is 'Ready'", () => {
    const vault = validateAndTransitionVault(TEST_ID, TEST_PATH, TEST_TS) as unknown as VaultAggregate;
    expect(vault.status.kind).toBe("Ready");
  });

  test("status.path equals the input path", () => {
    const vault = validateAndTransitionVault(TEST_ID, TEST_PATH, TEST_TS) as unknown as VaultAggregate;
    const status = vault.status as VaultStatusReady;
    expect(status.path).toBe(TEST_PATH);
  });

  test("id equals the input vaultId", () => {
    const vault = validateAndTransitionVault(TEST_ID, TEST_PATH, TEST_TS) as unknown as VaultAggregate;
    expect(vault.id).toBe(TEST_ID);
  });

  test("last_scanned_at is null (first-time configure)", () => {
    const vault = validateAndTransitionVault(TEST_ID, TEST_PATH, TEST_TS) as unknown as VaultAggregate;
    const status = vault.status as VaultStatusReady;
    expect(status.last_scanned_at).toBeNull();
  });
});

// ── REQ-008: Pure — same inputs, structurally identical output ────────────────

describe("REQ-008 / PROP-CV-004: validateAndTransitionVault is pure (deterministic)", () => {
  test("identical inputs produce structurally equal output on repeated calls", () => {
    const result1 = validateAndTransitionVault(TEST_ID, TEST_PATH, TEST_TS);
    const result2 = validateAndTransitionVault(TEST_ID, TEST_PATH, TEST_TS);
    expect(result1).toEqual(result2);
  });

  test("different path inputs produce different output paths", () => {
    const pathA = vaultPath("/vault/a");
    const pathB = vaultPath("/vault/b");
    const vaultA = validateAndTransitionVault(TEST_ID, pathA, TEST_TS) as unknown as VaultAggregate;
    const vaultB = validateAndTransitionVault(TEST_ID, pathB, TEST_TS) as unknown as VaultAggregate;
    const statusA = vaultA.status as VaultStatusReady;
    const statusB = vaultB.status as VaultStatusReady;
    expect(statusA.path).not.toBe(statusB.path);
  });

  test("different vaultId inputs produce different vault.id values", () => {
    const idA = vaultId("vault-a");
    const idB = vaultId("vault-b");
    const vaultA = validateAndTransitionVault(idA, TEST_PATH, TEST_TS) as unknown as VaultAggregate;
    const vaultB = validateAndTransitionVault(idB, TEST_PATH, TEST_TS) as unknown as VaultAggregate;
    expect(vaultA.id).not.toBe(vaultB.id);
  });

  test("different timestamp inputs still produce Ready status (timestamp does not gate output)", () => {
    const ts1 = ts(1000);
    const ts2 = ts(9_999_999);
    const v1 = validateAndTransitionVault(TEST_ID, TEST_PATH, ts1) as unknown as VaultAggregate;
    const v2 = validateAndTransitionVault(TEST_ID, TEST_PATH, ts2) as unknown as VaultAggregate;
    expect(v1.status.kind).toBe("Ready");
    expect(v2.status.kind).toBe("Ready");
  });

  test("_now is NOT written to output — varying timestamp produces structurally identical vaults (regression guard for Date.now() leak)", () => {
    // This test locks down that `_now` is never populated into last_scanned_at.
    // A regression that reads Date.now() from a closure instead of the `_now` parameter
    // would still fail here because the frozen expected value has last_scanned_at: null.
    const frozen: VaultAggregate = Object.freeze({
      id: TEST_ID,
      status: Object.freeze({
        kind: "Ready" as const,
        path: TEST_PATH,
        last_scanned_at: null,
      }),
    });

    const withTs1 = validateAndTransitionVault(TEST_ID, TEST_PATH, ts(1)) as unknown as VaultAggregate;
    const withTs2 = validateAndTransitionVault(TEST_ID, TEST_PATH, ts(999_999_999)) as unknown as VaultAggregate;

    expect(withTs1).toEqual(frozen);
    expect(withTs2).toEqual(frozen);
    // Both calls are structurally equal regardless of timestamp — _now has no observable effect.
    expect(withTs1).toEqual(withTs2);
  });

  test("function is total — does not throw for any valid (vaultId, path, now)", () => {
    expect(() => validateAndTransitionVault(
      vaultId("any-vault"),
      vaultPath("/any/path"),
      ts(0),
    )).not.toThrow();
  });
});

// ── PROP-CV-011: Repeat configure (idempotency — same result regardless of prior state) ──

describe("PROP-CV-011: Repeat configure with different path — Ready { new path }", () => {
  test("calling with new path after previous Ready — returns Ready with new path", () => {
    const pathA = vaultPath("/vault/path-a");
    const pathB = vaultPath("/vault/path-b");

    // First call (simulates initial configure)
    const first = validateAndTransitionVault(TEST_ID, pathA, TEST_TS) as unknown as VaultAggregate;
    expect((first.status as VaultStatusReady).path).toBe(pathA);

    // Second call (simulates re-configure — different path)
    const second = validateAndTransitionVault(TEST_ID, pathB, TEST_TS) as unknown as VaultAggregate;
    expect((second.status as VaultStatusReady).path).toBe(pathB);

    // The old path is NOT retained in the new result
    expect((second.status as VaultStatusReady).path).not.toBe(pathA);
  });

  test("calling multiple times with same path returns structurally equal results", () => {
    const path = vaultPath("/vault/stable-path");
    const call1 = validateAndTransitionVault(TEST_ID, path, TEST_TS);
    const call2 = validateAndTransitionVault(TEST_ID, path, TEST_TS);
    const call3 = validateAndTransitionVault(TEST_ID, path, TEST_TS);
    expect(call1).toEqual(call2);
    expect(call2).toEqual(call3);
  });
});
