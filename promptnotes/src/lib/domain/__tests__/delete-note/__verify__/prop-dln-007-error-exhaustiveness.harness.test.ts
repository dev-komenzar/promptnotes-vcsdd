/**
 * PROP-DLN-006 / PROP-DLN-007: Error discriminator exhaustiveness.
 *
 * Tier 0 — TypeScript compile-time exhaustiveness.
 * Required: true
 *
 * Proof obligations:
 * (a) TypeScript switch over DeletionError.kind with never branch compiles
 *     (exactly 'authorization' and 'fs').
 * (b) Switch over AuthorizationError.kind with never branch compiles
 *     (exactly 'editing-in-progress' and 'not-in-feed').
 * (c) Switch over FsError.kind within the 'fs' branch compiles — includes
 *     explicit arms for 'permission', 'lock', 'not-found', 'disk-full', 'unknown'.
 *     The 'disk-full' arm must be EXPLICIT (FIND-SPEC-DLN-002: no silent absorption
 *     via default/never).
 *
 * Also covers PROP-DLN-007 (non-coupling type assertion) via the Delta 6
 * extension check: AuthorizationError { kind: 'not-in-feed' } has optional
 * cause?: 'snapshot-missing', and the discriminator remains 'not-in-feed'
 * (no new arm required in exhaustiveness switches).
 *
 * Covers: REQ-DLN-002, REQ-DLN-003, REQ-DLN-004, REQ-DLN-013
 *
 * Note: This is a pure compile-time test. No imports from implementation files needed.
 */

import { describe, test, expect } from "bun:test";
import type { DeletionError, AuthorizationError, FsError } from "promptnotes-domain-types/shared/errors";
import type { AuthorizationErrorDelta, DeletionErrorDelta } from "../_deltas";

// ── Tier 0: TypeScript exhaustiveness proofs ──────────────────────────────

/**
 * (a) DeletionError exhaustiveness: exactly 'authorization' and 'fs'.
 * Adding a third variant without updating this function would cause a compile error.
 */
function assertDeletionErrorExhaustive(error: DeletionError): "authorization" | "fs" {
  switch (error.kind) {
    case "authorization":
      return "authorization";
    case "fs":
      return "fs";
    default: {
      const _never: never = error;
      return _never;
    }
  }
}

/**
 * (b) AuthorizationError exhaustiveness: exactly 'editing-in-progress' and 'not-in-feed'.
 * Delta 6 adds `cause?: 'snapshot-missing'` to the 'not-in-feed' variant but does NOT
 * add a new discriminator arm — the existing switch remains exhaustive.
 */
function assertAuthorizationErrorExhaustive(error: AuthorizationError): "editing-in-progress" | "not-in-feed" {
  switch (error.kind) {
    case "editing-in-progress":
      return "editing-in-progress";
    case "not-in-feed":
      return "not-in-feed";
    default: {
      const _never: never = error;
      return _never;
    }
  }
}

/**
 * (c) FsError exhaustiveness: all 5 variants handled with explicit arms.
 * 'disk-full' must be explicit (not absorbed by default/never) per FIND-SPEC-DLN-002.
 * Returns the mapped NoteDeletionFailureReason (including 'not-found' for graceful path).
 */
function assertFsErrorExhaustive(err: FsError): "permission" | "lock" | "not-found" | "unknown" {
  switch (err.kind) {
    case "permission":
      return "permission";
    case "lock":
      return "lock";
    case "not-found":
      return "not-found";
    case "disk-full":
      // Explicit arm required — maps to 'unknown' (normalization per REQ-DLN-013)
      return "unknown";
    case "unknown":
      return "unknown";
    default: {
      const _never: never = err;
      return _never;
    }
  }
}

/**
 * DeletionErrorDelta exhaustiveness: covers the extended Delta 6 shape.
 * AuthorizationErrorDelta { kind: 'not-in-feed'; cause?: 'snapshot-missing' }
 * remains a single arm — no new arm needed for the optional cause field.
 */
function assertDeletionErrorDeltaExhaustive(error: DeletionErrorDelta): "authorization" | "fs" {
  switch (error.kind) {
    case "authorization":
      return "authorization";
    case "fs":
      return "fs";
    default: {
      const _never: never = error;
      return _never;
    }
  }
}

/**
 * AuthorizationErrorDelta exhaustiveness: Delta 6 extends 'not-in-feed' with
 * optional `cause` but does NOT add a new discriminator.
 */
function assertAuthorizationErrorDeltaExhaustive(
  error: AuthorizationErrorDelta,
): "editing-in-progress" | "not-in-feed" {
  switch (error.kind) {
    case "editing-in-progress":
      return "editing-in-progress";
    case "not-in-feed":
      // Optional cause?: 'snapshot-missing' does not require an additional arm.
      return "not-in-feed";
    default: {
      const _never: never = error;
      return _never;
    }
  }
}

// ── PROP-DLN-006(a): DeletionError exhaustiveness ────────────────────────

describe("PROP-DLN-006(a): DeletionError is exhaustive — exactly 'authorization' and 'fs'", () => {
  test("Tier-0 compile-time proof: assertDeletionErrorExhaustive compiles", () => {
    expect(typeof assertDeletionErrorExhaustive).toBe("function");
  });

  test("kind='authorization' is handled", () => {
    const err: DeletionError = {
      kind: "authorization",
      reason: { kind: "editing-in-progress", noteId: "id-001" as never },
    };
    expect(assertDeletionErrorExhaustive(err)).toBe("authorization");
  });

  test("kind='fs' is handled", () => {
    const err: DeletionError = {
      kind: "fs",
      reason: { kind: "unknown", detail: "test" },
    };
    expect(assertDeletionErrorExhaustive(err)).toBe("fs");
  });
});

// ── PROP-DLN-006(b): AuthorizationError exhaustiveness ───────────────────

describe("PROP-DLN-006(b): AuthorizationError is exhaustive — exactly 2 variants (Delta 6 optional cause is not a new arm)", () => {
  test("Tier-0 compile-time proof: assertAuthorizationErrorExhaustive compiles", () => {
    expect(typeof assertAuthorizationErrorExhaustive).toBe("function");
  });

  test("kind='editing-in-progress' is handled", () => {
    const err: AuthorizationError = {
      kind: "editing-in-progress",
      noteId: "id-001" as never,
    };
    expect(assertAuthorizationErrorExhaustive(err)).toBe("editing-in-progress");
  });

  test("kind='not-in-feed' is handled (with or without Delta 6 cause field)", () => {
    const err: AuthorizationError = {
      kind: "not-in-feed",
      noteId: "id-001" as never,
    };
    expect(assertAuthorizationErrorExhaustive(err)).toBe("not-in-feed");
  });
});

// ── PROP-DLN-006(c): FsError exhaustiveness with explicit disk-full arm ──

describe("PROP-DLN-006(c): FsError exhaustive — explicit disk-full arm (FIND-SPEC-DLN-002)", () => {
  test("Tier-0 compile-time proof: assertFsErrorExhaustive compiles with explicit disk-full arm", () => {
    expect(typeof assertFsErrorExhaustive).toBe("function");
  });

  test("'permission' arm returns 'permission'", () => {
    expect(assertFsErrorExhaustive({ kind: "permission" })).toBe("permission");
  });

  test("'lock' arm returns 'lock'", () => {
    expect(assertFsErrorExhaustive({ kind: "lock" })).toBe("lock");
  });

  test("'not-found' arm returns 'not-found'", () => {
    expect(assertFsErrorExhaustive({ kind: "not-found" })).toBe("not-found");
  });

  test("'disk-full' arm (explicit) returns 'unknown' — normalized per REQ-DLN-013", () => {
    expect(assertFsErrorExhaustive({ kind: "disk-full" })).toBe("unknown");
  });

  test("'unknown' arm returns 'unknown'", () => {
    expect(assertFsErrorExhaustive({ kind: "unknown", detail: "io error" })).toBe("unknown");
  });
});

// ── Delta 6: AuthorizationErrorDelta optional cause does not break exhaustiveness ─

describe("Delta 6: AuthorizationErrorDelta — optional cause does not add a new discriminator arm", () => {
  test("Tier-0: assertAuthorizationErrorDeltaExhaustive compiles with exactly 2 arms", () => {
    expect(typeof assertAuthorizationErrorDeltaExhaustive).toBe("function");
  });

  test("not-in-feed without cause is handled", () => {
    const err: AuthorizationErrorDelta = {
      kind: "not-in-feed",
      noteId: "id-001" as never,
    };
    expect(assertAuthorizationErrorDeltaExhaustive(err)).toBe("not-in-feed");
  });

  test("not-in-feed with cause='snapshot-missing' is handled by the same arm", () => {
    const err: AuthorizationErrorDelta = {
      kind: "not-in-feed",
      noteId: "id-001" as never,
      cause: "snapshot-missing",
    };
    expect(assertAuthorizationErrorDeltaExhaustive(err)).toBe("not-in-feed");
  });

  test("editing-in-progress is handled", () => {
    const err: AuthorizationErrorDelta = {
      kind: "editing-in-progress",
      noteId: "id-001" as never,
    };
    expect(assertAuthorizationErrorDeltaExhaustive(err)).toBe("editing-in-progress");
  });
});

// @ts-expect-error — "totally-fake-kind" is not a valid DeletionError.kind
assertDeletionErrorExhaustive({ kind: "totally-fake-kind" } as never);
