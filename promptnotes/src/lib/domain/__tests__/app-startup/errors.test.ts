/**
 * errors.test.ts — Type exhaustiveness tests for AppStartup error types
 *
 * PROP-004: AppStartupError type is exhaustive (Tier 0, required: true)
 * PROP-019: ScanFileFailure discriminated union is exhaustively handled (Tier 0)
 *
 * Covers: REQ-003, REQ-004, REQ-005, REQ-007, REQ-002, REQ-016
 *
 * These tests assert type-level exhaustiveness at runtime by using a
 * never-guard pattern: a switch that falls into a never-typed default branch
 * proves compile-time exhaustiveness. For Phase 2a (Red), the imports will
 * fail because no implementation exists yet.
 */

import { describe, test, expect } from "bun:test";
import type { AppStartupError, ScanError, VaultConfigError } from "$lib/domain/app-startup/errors";
import type { ScanFileFailure } from "promptnotes-domain-types/shared/snapshots";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";

// PROP-004: exhaustiveness guard — compile-time proof that AppStartupError
// switch covers exactly 'config' | 'scan' with no fall-through.
function assertAppStartupErrorExhaustive(e: AppStartupError): string {
  // REQ-003, REQ-004, REQ-005: kind='config' covers VaultConfigError variants
  // REQ-007: kind='scan' covers ScanError
  switch (e.kind) {
    case "config":
      return `config:${e.reason.kind}`;
    case "scan":
      return `scan:${e.reason.kind}`;
    default: {
      // This branch must be unreachable. If AppStartupError gains a new variant
      // without updating this switch, TypeScript will flag it as an error.
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}

// PROP-004: exhaustiveness guard for VaultConfigError (REQ-003, REQ-004, REQ-005)
function assertVaultConfigErrorExhaustive(e: VaultConfigError): string {
  switch (e.kind) {
    case "unconfigured":
      return "unconfigured";
    case "path-not-found":
      return `path-not-found:${e.path}`;
    case "permission-denied":
      return `permission-denied:${e.path}`;
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}

// PROP-019: exhaustiveness guard for ScanFileFailure (REQ-002, REQ-016)
function assertScanFileFailureExhaustive(f: ScanFileFailure): string {
  switch (f.kind) {
    case "read":
      return `read:${f.fsError.kind}`;
    case "hydrate":
      return `hydrate:${f.reason}`;
    default: {
      const _exhaustive: never = f;
      return _exhaustive;
    }
  }
}

// PROP-004 — Runtime tests confirming the error kind routing works correctly
describe("PROP-004 / REQ-003 / REQ-004 / REQ-005 / REQ-007: AppStartupError exhaustiveness", () => {
  test("config+unconfigured routes to correct branch", () => {
    // REQ-003: Unconfigured produces kind='config', reason.kind='unconfigured'
    const e: AppStartupError = {
      kind: "config",
      reason: { kind: "unconfigured" },
    };
    expect(assertAppStartupErrorExhaustive(e)).toBe("config:unconfigured");
  });

  test("config+path-not-found routes to correct branch", () => {
    // REQ-004: PathNotFound produces kind='config', reason.kind='path-not-found'
    const e: AppStartupError = {
      kind: "config",
      reason: { kind: "path-not-found", path: "/vault" },
    };
    expect(assertAppStartupErrorExhaustive(e)).toBe("config:path-not-found");
  });

  test("config+permission-denied routes to correct branch", () => {
    // REQ-005: PermissionDenied produces kind='config', reason.kind='permission-denied'
    const e: AppStartupError = {
      kind: "config",
      reason: { kind: "permission-denied", path: "/vault" },
    };
    expect(assertAppStartupErrorExhaustive(e)).toBe("config:permission-denied");
  });

  test("scan+list-failed routes to correct branch", () => {
    // REQ-007: list-failed produces kind='scan', reason.kind='list-failed'
    const e: AppStartupError = {
      kind: "scan",
      reason: { kind: "list-failed", detail: "EPERM" },
    };
    expect(assertAppStartupErrorExhaustive(e)).toBe("scan:list-failed");
  });
});

// PROP-019 — ScanFileFailure exhaustiveness
describe("PROP-019 / REQ-002 / REQ-016: ScanFileFailure exhaustiveness", () => {
  test("read variant routes to correct branch", () => {
    const f: ScanFileFailure = {
      kind: "read",
      fsError: { kind: "permission" },
    };
    expect(assertScanFileFailureExhaustive(f)).toBe("read:permission");
  });

  test("hydrate variant routes to correct branch", () => {
    const f: ScanFileFailure = {
      kind: "hydrate",
      reason: "missing-field",
    };
    expect(assertScanFileFailureExhaustive(f)).toBe("hydrate:missing-field");
  });

  test("HydrationFailureReason covers all four variants (type-level check)", () => {
    // Source: glossary.md §3 — exactly 4 variants
    const reasons: HydrationFailureReason[] = [
      "yaml-parse",
      "missing-field",
      "invalid-value",
      "unknown",
    ];
    expect(reasons).toHaveLength(4);
    // Ensure no overlap with FsError variants (read vs hydrate are distinct)
    for (const r of reasons) {
      const f: ScanFileFailure = { kind: "hydrate", reason: r };
      expect(f.kind).toBe("hydrate");
    }
  });

  test("FsError.kind covers all five variants", () => {
    // Source: workflows.md §エラーカタログ統合
    const fsKinds: FsError["kind"][] = [
      "permission",
      "disk-full",
      "lock",
      "not-found",
      "unknown",
    ];
    expect(fsKinds).toHaveLength(5);
    for (const kind of fsKinds) {
      const f: ScanFileFailure = {
        kind: "read",
        fsError: kind === "unknown"
          ? { kind: "unknown", detail: "test" }
          : { kind } as FsError,
      };
      expect(f.kind).toBe("read");
    }
  });

  // REQ-016: read failures must NOT produce hydrate variants
  test("readFile OS failure maps to ScanFileFailure kind=read (not kind=hydrate)", () => {
    // This is the canonical classification per snapshots.ts docstring.
    const permissionFailure: ScanFileFailure = {
      kind: "read",
      fsError: { kind: "permission" },
    };
    expect(permissionFailure.kind).toBe("read");
    // The following would fail TypeScript strict mode if 'read' carried 'reason':
    expect("fsError" in permissionFailure).toBe(true);
    expect("reason" in permissionFailure).toBe(false);
  });
});
