/**
 * map-stat-dir-result.test.ts — Pure helper mapStatDirResult
 *
 * PROP-CV-001: mapStatDirResult is pure (Tier 1)
 * PROP-CV-002: mapStatDirResult collapse rule — all 7 input cases (Tier 1)
 *
 * Carry-forward FIND-002: The correct signature is
 *   mapStatDirResult(statResult: Result<boolean, FsError>, pathStr: string)
 *     → Result<void, VaultConfigError>
 * NOT the old `mapStatDirError(fsError)` shape.
 *
 * Domain (from behavioral-spec.md Error Catalog):
 *   Ok(true)                       → Ok(void)             (directory confirmed)
 *   Ok(false)                      → path-not-found
 *   Err({ kind: "not-found" })     → path-not-found
 *   Err({ kind: "permission" })    → permission-denied
 *   Err({ kind: "disk-full" })     → path-not-found
 *   Err({ kind: "lock" })          → path-not-found
 *   Err({ kind: "unknown" })       → path-not-found
 *
 * NOTE: Import MUST FAIL — map-stat-dir-result.ts does not exist yet.
 * This is the RED phase signal.
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";

// RED PHASE: This import MUST FAIL — map-stat-dir-result.ts does not exist yet.
import { mapStatDirResult } from "$lib/domain/configure-vault/map-stat-dir-result";

// ── REQ-001 / PROP-CV-002: Ok(true) → Ok(void) ───────────────────────────────

describe("mapStatDirResult: Ok(true) → Ok(void) (directory confirmed)", () => {
  test("returns Ok", () => {
    const result = mapStatDirResult({ ok: true, value: true }, "/home/user/vault");
    expect(result.ok).toBe(true);
  });

  test("Ok value is undefined (void)", () => {
    const result = mapStatDirResult({ ok: true, value: true }, "/home/user/vault");
    if (!result.ok) throw new Error("Expected Ok");
    expect(result.value).toBeUndefined();
  });
});

// ── REQ-002 / PROP-CV-002: Ok(false) → path-not-found ────────────────────────

describe("mapStatDirResult: Ok(false) → path-not-found", () => {
  test("returns Err with kind 'path-not-found'", () => {
    const result = mapStatDirResult({ ok: true, value: false }, "/home/user/vault");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("path-not-found");
  });

  test("error.path matches the input pathStr", () => {
    const result = mapStatDirResult({ ok: true, value: false }, "/specific/path");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.error.kind === "path-not-found") {
      expect(result.error.path).toBe("/specific/path");
    }
  });
});

// ── REQ-003 / PROP-CV-002: Err(not-found) → path-not-found ──────────────────

describe("mapStatDirResult: Err(not-found) → path-not-found", () => {
  test("returns Err with kind 'path-not-found'", () => {
    const result = mapStatDirResult({ ok: false, error: { kind: "not-found" } }, "/home/user/vault");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("path-not-found");
  });

  test("error.path matches the input pathStr", () => {
    const result = mapStatDirResult({ ok: false, error: { kind: "not-found" } }, "/specific/path");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.error.kind === "path-not-found") {
      expect(result.error.path).toBe("/specific/path");
    }
  });

  test("Ok(false) and Err(not-found) produce the same error kind (collapse rule parity)", () => {
    const fromOkFalse = mapStatDirResult({ ok: true, value: false }, "/path");
    const fromErrNotFound = mapStatDirResult({ ok: false, error: { kind: "not-found" } }, "/path");
    expect(fromOkFalse.ok).toBe(false);
    expect(fromErrNotFound.ok).toBe(false);
    if (!fromOkFalse.ok && !fromErrNotFound.ok) {
      expect(fromOkFalse.error.kind).toBe(fromErrNotFound.error.kind);
    }
  });
});

// ── REQ-004 / PROP-CV-002: Err(permission) → permission-denied ───────────────

describe("mapStatDirResult: Err(permission) → permission-denied", () => {
  test("returns Err with kind 'permission-denied'", () => {
    const result = mapStatDirResult({ ok: false, error: { kind: "permission" } }, "/root/secret");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("permission-denied");
  });

  test("error.path matches the input pathStr", () => {
    const result = mapStatDirResult({ ok: false, error: { kind: "permission" } }, "/root/secret");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.error.kind === "permission-denied") {
      expect(result.error.path).toBe("/root/secret");
    }
  });

  test("permission-denied is distinct from path-not-found (NOT collapsed)", () => {
    const permResult = mapStatDirResult({ ok: false, error: { kind: "permission" } }, "/path");
    const notFoundResult = mapStatDirResult({ ok: false, error: { kind: "not-found" } }, "/path");
    expect(permResult.ok).toBe(false);
    expect(notFoundResult.ok).toBe(false);
    if (!permResult.ok && !notFoundResult.ok) {
      expect(permResult.error.kind).not.toBe(notFoundResult.error.kind);
    }
  });
});

// ── REQ-005 / PROP-CV-002: Err(disk-full|lock|unknown) → path-not-found ──────

describe("mapStatDirResult: Err(disk-full|lock|unknown) → path-not-found (collapsed)", () => {
  const collapsedFsErrors: FsError[] = [
    { kind: "disk-full" },
    { kind: "lock" },
    { kind: "unknown", detail: "OS error details" },
  ];

  for (const fsErr of collapsedFsErrors) {
    test(`Err(${fsErr.kind}) → path-not-found`, () => {
      const result = mapStatDirResult({ ok: false, error: fsErr }, "/vault/path");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("path-not-found");
    });

    test(`Err(${fsErr.kind}) does NOT produce permission-denied`, () => {
      const result = mapStatDirResult({ ok: false, error: fsErr }, "/vault/path");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).not.toBe("permission-denied");
    });

    test(`Err(${fsErr.kind}) error.path matches input pathStr`, () => {
      const result = mapStatDirResult({ ok: false, error: fsErr }, "/specific/path");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      if (result.error.kind === "path-not-found") {
        expect(result.error.path).toBe("/specific/path");
      }
    });
  }
});

// ── PROP-CV-001: Purity — same inputs produce structurally identical output ───

describe("PROP-CV-001: mapStatDirResult is pure (deterministic)", () => {
  const allStatResults: Array<{ input: Result<boolean, FsError>; label: string }> = [
    { input: { ok: true, value: true }, label: "Ok(true)" },
    { input: { ok: true, value: false }, label: "Ok(false)" },
    { input: { ok: false, error: { kind: "not-found" } }, label: "Err(not-found)" },
    { input: { ok: false, error: { kind: "permission" } }, label: "Err(permission)" },
    { input: { ok: false, error: { kind: "disk-full" } }, label: "Err(disk-full)" },
    { input: { ok: false, error: { kind: "lock" } }, label: "Err(lock)" },
    { input: { ok: false, error: { kind: "unknown", detail: "x" } }, label: "Err(unknown)" },
  ];

  for (const { input, label } of allStatResults) {
    test(`${label}: repeated calls return structurally equal results`, () => {
      const r1 = mapStatDirResult(input, "/vault");
      const r2 = mapStatDirResult(input, "/vault");
      const r3 = mapStatDirResult(input, "/vault");
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });
  }

  test("pathStr is included in error.path for all Err outputs", () => {
    const errInputs: Result<boolean, FsError>[] = [
      { ok: true, value: false },
      { ok: false, error: { kind: "not-found" } },
      { ok: false, error: { kind: "permission" } },
      { ok: false, error: { kind: "disk-full" } },
      { ok: false, error: { kind: "lock" } },
      { ok: false, error: { kind: "unknown", detail: "x" } },
    ];

    const sentinel = "/sentinel/path-" + Math.random().toString(36);
    for (const input of errInputs) {
      const result = mapStatDirResult(input, sentinel);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const err = result.error as { path?: string };
        expect(err.path).toBe(sentinel);
      }
    }
  });
});

// ── PROP-CV-002: Full collapse rule enumeration ───────────────────────────────

describe("PROP-CV-002: complete collapse rule — all 7 cases", () => {
  test("case 1: Ok(true) → Ok(void)", () => {
    const r = mapStatDirResult({ ok: true, value: true }, "/path");
    expect(r.ok).toBe(true);
  });

  test("case 2: Ok(false) → path-not-found", () => {
    const r = mapStatDirResult({ ok: true, value: false }, "/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("path-not-found");
  });

  test("case 3: Err(not-found) → path-not-found", () => {
    const r = mapStatDirResult({ ok: false, error: { kind: "not-found" } }, "/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("path-not-found");
  });

  test("case 4: Err(permission) → permission-denied", () => {
    const r = mapStatDirResult({ ok: false, error: { kind: "permission" } }, "/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("permission-denied");
  });

  test("case 5: Err(disk-full) → path-not-found", () => {
    const r = mapStatDirResult({ ok: false, error: { kind: "disk-full" } }, "/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("path-not-found");
  });

  test("case 6: Err(lock) → path-not-found", () => {
    const r = mapStatDirResult({ ok: false, error: { kind: "lock" } }, "/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("path-not-found");
  });

  test("case 7: Err(unknown) → path-not-found", () => {
    const r = mapStatDirResult({ ok: false, error: { kind: "unknown", detail: "x" } }, "/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("path-not-found");
  });

  test("permission-denied is ONLY produced by Err(permission) — no other variant produces it", () => {
    const nonPermissionInputs: Result<boolean, FsError>[] = [
      { ok: true, value: false },
      { ok: false, error: { kind: "not-found" } },
      { ok: false, error: { kind: "disk-full" } },
      { ok: false, error: { kind: "lock" } },
      { ok: false, error: { kind: "unknown", detail: "x" } },
    ];

    for (const input of nonPermissionInputs) {
      const r = mapStatDirResult(input, "/path");
      if (!r.ok) {
        expect(r.error.kind).not.toBe("permission-denied");
      }
    }
  });
});
