/**
 * step3-trash-file.test.ts — Boundary contract tests for the TrashFile port
 *
 * REQ-DLN-004: Filesystem Error — permission, lock, disk-full, or unknown
 * REQ-DLN-005: Filesystem Error — not-found (graceful continue)
 * REQ-DLN-013: disk-full normalization and FsError.unknown.detail propagation
 *
 * PROP-DLN-003: Save-failure projection isolation
 * PROP-DLN-006(c): FsError.kind exhaustiveness — including explicit disk-full arm
 * PROP-DLN-017: disk-full → 'unknown' normalization is total
 * PROP-DLN-018: FsError.unknown.detail propagation
 *
 * Tests the Result<void, FsError> boundary contract: verifies that each
 * FsError variant produces the correct normalized NoteDeletionFailureReason.
 * Also verifies the disk-full normalization mapping exhaustiveness.
 *
 * RED phase: imports from non-existent implementation file.
 * Module resolution failure is valid RED evidence.
 */

import { describe, test, expect } from "bun:test";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { NoteDeletionFailureReason } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";

import { normalizeFsError } from "../../delete-note/normalize-fs-error";

// ── FsError → NoteDeletionFailureReason mapping table ────────────────────

describe("REQ-DLN-004 / PROP-DLN-014: FsError → NoteDeletionFailureReason mapping", () => {
  test("FsError { kind: 'permission' } → 'permission'", () => {
    const fsError: FsError = { kind: "permission" };

    const { reason } = normalizeFsError(fsError);

    expect(reason).toBe("permission");
  });

  test("FsError { kind: 'lock' } → 'lock'", () => {
    const fsError: FsError = { kind: "lock" };

    const { reason } = normalizeFsError(fsError);

    expect(reason).toBe("lock");
  });

  test("FsError { kind: 'not-found' } → 'not-found'", () => {
    const fsError: FsError = { kind: "not-found" };

    const { reason } = normalizeFsError(fsError);

    expect(reason).toBe("not-found");
  });

  test("REQ-DLN-013 / PROP-DLN-017: FsError { kind: 'disk-full' } → 'unknown'", () => {
    const fsError: FsError = { kind: "disk-full" };

    const { reason } = normalizeFsError(fsError);

    expect(reason).toBe("unknown");
  });

  test("FsError { kind: 'unknown' } → 'unknown'", () => {
    const fsError: FsError = { kind: "unknown", detail: "some detail" };

    const { reason } = normalizeFsError(fsError);

    expect(reason).toBe("unknown");
  });
});

// ── detail propagation ────────────────────────────────────────────────────

describe("REQ-DLN-013 / PROP-DLN-017 / PROP-DLN-018: detail propagation", () => {
  test("PROP-DLN-017: detail === 'disk-full' (diagnostic string) when FsError.kind === 'disk-full'", () => {
    const fsError: FsError = { kind: "disk-full" };

    const { detail } = normalizeFsError(fsError);

    expect(detail).toBe("disk-full");
  });

  test("PROP-DLN-018: detail === FsError.detail when FsError.kind === 'unknown'", () => {
    const detail = "I/O timeout on /vault/note.md";
    const fsError: FsError = { kind: "unknown", detail };

    const { detail: normalizedDetail } = normalizeFsError(fsError);

    expect(normalizedDetail).toBe(detail);
  });

  test("PROP-DLN-018: exact string propagation for FsError.unknown.detail", () => {
    const uniqueDetail = "unique-error-message-12345";
    const fsError: FsError = { kind: "unknown", detail: uniqueDetail };

    const { detail: normalizedDetail } = normalizeFsError(fsError);

    expect(normalizedDetail).toBe(uniqueDetail);
  });

  test("detail is undefined for FsError { kind: 'permission' }", () => {
    const fsError: FsError = { kind: "permission" };

    const { detail } = normalizeFsError(fsError);

    expect(detail).toBeUndefined();
  });

  test("detail is undefined for FsError { kind: 'lock' }", () => {
    const fsError: FsError = { kind: "lock" };

    const { detail } = normalizeFsError(fsError);

    expect(detail).toBeUndefined();
  });

  test("detail is undefined for FsError { kind: 'not-found' }", () => {
    const fsError: FsError = { kind: "not-found" };

    const { detail } = normalizeFsError(fsError);

    expect(detail).toBeUndefined();
  });
});

// ── PROP-DLN-006(c): FsError exhaustiveness switch ───────────────────────

describe("PROP-DLN-006(c): FsError exhaustiveness — all variants covered including disk-full", () => {
  /**
   * This function mirrors what the production switch must do.
   * If a new FsError variant were added without updating the switch,
   * TypeScript would infer `_never` as non-never and the assignment would fail.
   * The explicit 'disk-full' arm is required per FIND-SPEC-DLN-002.
   */
  function exhaustiveFsErrorSwitch(err: FsError): NoteDeletionFailureReason | "not-found" {
    switch (err.kind) {
      case "permission":
        return "permission";
      case "lock":
        return "lock";
      case "not-found":
        return "not-found";
      case "disk-full":
        // Must have explicit arm — may NOT fall through to default/never
        return "unknown";
      case "unknown":
        return "unknown";
      default: {
        const _never: never = err;
        return _never;
      }
    }
  }

  test("Tier-0: exhaustiveFsErrorSwitch compiles with explicit disk-full arm", () => {
    expect(typeof exhaustiveFsErrorSwitch).toBe("function");
  });

  test("permission arm returns 'permission'", () => {
    expect(exhaustiveFsErrorSwitch({ kind: "permission" })).toBe("permission");
  });

  test("lock arm returns 'lock'", () => {
    expect(exhaustiveFsErrorSwitch({ kind: "lock" })).toBe("lock");
  });

  test("not-found arm returns 'not-found'", () => {
    expect(exhaustiveFsErrorSwitch({ kind: "not-found" })).toBe("not-found");
  });

  test("disk-full arm (explicit) returns 'unknown' — FIND-SPEC-DLN-002", () => {
    expect(exhaustiveFsErrorSwitch({ kind: "disk-full" })).toBe("unknown");
  });

  test("unknown arm returns 'unknown'", () => {
    expect(exhaustiveFsErrorSwitch({ kind: "unknown", detail: "test" })).toBe("unknown");
  });
});

// ── TrashFile port Result shape ───────────────────────────────────────────

describe("TrashFile port — Result<void, FsError> shape contract", () => {
  test("a mock TrashFile that returns Ok(void) has the correct shape", async () => {
    const mockTrashFile = async (_filePath: string): Promise<Result<void, FsError>> => ({
      ok: true,
      value: undefined,
    });

    const result = await mockTrashFile("/vault/note.md");

    expect(result.ok).toBe(true);
  });

  test("a mock TrashFile that returns Err(FsError) has the correct shape", async () => {
    const mockTrashFile = async (_filePath: string): Promise<Result<void, FsError>> => ({
      ok: false,
      error: { kind: "permission" },
    });

    const result = await mockTrashFile("/vault/note.md");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("permission");
  });
});
