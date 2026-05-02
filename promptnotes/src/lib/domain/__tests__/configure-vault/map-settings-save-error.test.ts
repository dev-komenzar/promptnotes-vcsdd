/**
 * map-settings-save-error.test.ts — Pure helper mapSettingsSaveError
 *
 * PROP-CV-003: mapSettingsSaveError collapse rule — all FsError variants (Tier 1)
 * REQ-006: Settings.save Err(permission) → permission-denied
 * REQ-007: Settings.save Err(disk-full|lock|unknown) → path-not-found
 *
 * Signature (from verification-architecture.md):
 *   mapSettingsSaveError(fsError: FsError, pathStr: string): VaultConfigError
 *
 * Domain (from behavioral-spec.md Error Catalog):
 *   Err(permission)                → permission-denied
 *   Err(disk-full|lock|unknown|not-found) → path-not-found
 *
 * NOTE: Import MUST FAIL — map-settings-save-error.ts does not exist yet.
 * This is the RED phase signal.
 */

import { describe, test, expect } from "bun:test";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";

// RED PHASE: This import MUST FAIL — map-settings-save-error.ts does not exist yet.
import { mapSettingsSaveError } from "$lib/domain/configure-vault/map-settings-save-error";

const TEST_PATH = "/home/user/vault";

// ── REQ-006 / PROP-CV-003: permission → permission-denied ────────────────────

describe("mapSettingsSaveError: FsError(permission) → permission-denied (REQ-006)", () => {
  test("returns VaultConfigError with kind 'permission-denied'", () => {
    const result = mapSettingsSaveError({ kind: "permission" }, TEST_PATH);
    expect(result.kind).toBe("permission-denied");
  });

  test("error.path matches the input pathStr", () => {
    const result = mapSettingsSaveError({ kind: "permission" }, "/specific/path");
    if (result.kind === "permission-denied") {
      expect(result.path).toBe("/specific/path");
    } else {
      throw new Error("Expected permission-denied");
    }
  });

  test("permission variant does NOT produce path-not-found", () => {
    const result = mapSettingsSaveError({ kind: "permission" }, TEST_PATH);
    expect(result.kind).not.toBe("path-not-found");
  });

  test("permission variant does NOT produce unconfigured", () => {
    const result = mapSettingsSaveError({ kind: "permission" }, TEST_PATH);
    expect(result.kind).not.toBe("unconfigured");
  });
});

// ── REQ-007 / PROP-CV-003: disk-full|lock|unknown → path-not-found ───────────

describe("mapSettingsSaveError: FsError(disk-full|lock|unknown|not-found) → path-not-found (REQ-007)", () => {
  const collapsedErrors: Array<{ fsErr: FsError; label: string }> = [
    { fsErr: { kind: "disk-full" }, label: "disk-full" },
    { fsErr: { kind: "lock" }, label: "lock" },
    { fsErr: { kind: "unknown", detail: "settings store unavailable" }, label: "unknown" },
    // not-found for settings file is also collapsed to path-not-found
    { fsErr: { kind: "not-found" }, label: "not-found" },
  ];

  for (const { fsErr, label } of collapsedErrors) {
    test(`FsError(${label}) → path-not-found`, () => {
      const result = mapSettingsSaveError(fsErr, TEST_PATH);
      expect(result.kind).toBe("path-not-found");
    });

    test(`FsError(${label}) error.path matches input pathStr`, () => {
      const result = mapSettingsSaveError(fsErr, "/sentinel-path");
      if (result.kind === "path-not-found") {
        expect(result.path).toBe("/sentinel-path");
      } else {
        throw new Error(`Expected path-not-found, got ${result.kind}`);
      }
    });

    test(`FsError(${label}) does NOT produce permission-denied`, () => {
      const result = mapSettingsSaveError(fsErr, TEST_PATH);
      expect(result.kind).not.toBe("permission-denied");
    });

    test(`FsError(${label}) does NOT produce unconfigured`, () => {
      const result = mapSettingsSaveError(fsErr, TEST_PATH);
      expect(result.kind).not.toBe("unconfigured");
    });
  }
});

// ── PROP-CV-003: Full enumeration of all 5 FsError variants ──────────────────

describe("PROP-CV-003: complete collapse rule — all 5 FsError.kind variants", () => {
  test("case 1: permission → permission-denied", () => {
    const result = mapSettingsSaveError({ kind: "permission" }, TEST_PATH);
    expect(result.kind).toBe("permission-denied");
  });

  test("case 2: disk-full → path-not-found", () => {
    const result = mapSettingsSaveError({ kind: "disk-full" }, TEST_PATH);
    expect(result.kind).toBe("path-not-found");
  });

  test("case 3: lock → path-not-found", () => {
    const result = mapSettingsSaveError({ kind: "lock" }, TEST_PATH);
    expect(result.kind).toBe("path-not-found");
  });

  test("case 4: unknown → path-not-found", () => {
    const result = mapSettingsSaveError({ kind: "unknown", detail: "x" }, TEST_PATH);
    expect(result.kind).toBe("path-not-found");
  });

  test("case 5: not-found → path-not-found", () => {
    const result = mapSettingsSaveError({ kind: "not-found" }, TEST_PATH);
    expect(result.kind).toBe("path-not-found");
  });

  test("permission is the ONLY variant that produces permission-denied", () => {
    const nonPermissionErrors: FsError[] = [
      { kind: "disk-full" },
      { kind: "lock" },
      { kind: "unknown", detail: "x" },
      { kind: "not-found" },
    ];

    for (const fsErr of nonPermissionErrors) {
      const result = mapSettingsSaveError(fsErr, TEST_PATH);
      expect(result.kind).not.toBe("permission-denied");
    }
  });
});

// ── Purity: same inputs → same output ────────────────────────────────────────

describe("mapSettingsSaveError is pure (deterministic)", () => {
  const allErrors: FsError[] = [
    { kind: "permission" },
    { kind: "disk-full" },
    { kind: "lock" },
    { kind: "unknown", detail: "x" },
    { kind: "not-found" },
  ];

  for (const fsErr of allErrors) {
    test(`FsError(${fsErr.kind}): repeated calls return equal results`, () => {
      const r1 = mapSettingsSaveError(fsErr, TEST_PATH);
      const r2 = mapSettingsSaveError(fsErr, TEST_PATH);
      expect(r1).toEqual(r2);
    });
  }
});

// ── PROP-CV-013: REQ-006 explicit example — settings permission → permission-denied ──

describe("PROP-CV-013: Settings.save Err(permission) maps to permission-denied (not path-not-found)", () => {
  test("permission error is NOT mapped to path-not-found", () => {
    const result = mapSettingsSaveError({ kind: "permission" }, TEST_PATH);
    expect(result.kind).toBe("permission-denied");
    expect(result.kind).not.toBe("path-not-found");
  });
});

// ── PROP-CV-014: REQ-007 explicit example — settings disk-full → path-not-found ──

describe("PROP-CV-014: Settings.save Err(disk-full) maps to path-not-found (not permission-denied)", () => {
  test("disk-full error is NOT mapped to permission-denied", () => {
    const result = mapSettingsSaveError({ kind: "disk-full" }, TEST_PATH);
    expect(result.kind).toBe("path-not-found");
    expect(result.kind).not.toBe("permission-denied");
  });
});
