/**
 * PROP-TCU-007: SaveError + SaveValidationError.cause exhaustiveness.
 *
 * Tier 0+2 — TypeScript compile-time exhaustiveness + per-cause variant tests.
 * Required: true
 *
 * Proof obligations:
 * (a) TypeScript switch over SaveError.kind with never branch compiles.
 * (b) Switch over SaveValidationError.cause when kind === 'invariant-violated'
 *     with never branch compiles, covering exactly 3 causes.
 * (c) Per-cause variant: each cause discriminator can be produced
 *     by the corresponding error condition.
 *
 * Covers: REQ-TCU-005, REQ-TCU-006, REQ-TCU-007, REQ-TCU-008
 *
 * RED phase: imports from non-existent implementation file.
 */

import { describe, test, expect } from "bun:test";
import type { SaveErrorDelta, SaveValidationErrorDelta } from "../_deltas";

// ── Tier 0: TypeScript exhaustiveness proofs ──────────────────────────────

/**
 * (a) SaveErrorDelta exhaustiveness: exactly 'validation' and 'fs'.
 * Adding a third variant without updating this function would cause a compile error.
 */
function assertSaveErrorDeltaExhaustive(error: SaveErrorDelta): "validation" | "fs" {
  switch (error.kind) {
    case "validation":
      return "validation";
    case "fs":
      return "fs";
    default: {
      const _never: never = error;
      return _never;
    }
  }
}

/**
 * (b) SaveValidationErrorDelta.cause exhaustiveness when kind === 'invariant-violated':
 * exactly 3 causes — 'note-not-in-feed', 'hydration-failed', 'frontmatter-invariant'.
 * 'tag-vo-invalid' is intentionally excluded per behavioral-spec.md Delta 1.
 *
 * FIX (FIND-IMPL-TCU-001): Use Extract<> instead of distributive conditional.
 * The old form `SaveValidationErrorDelta extends { kind: "invariant-violated" } ? ... : never`
 * resolved to `never` because the full union does NOT extend the { kind: "invariant-violated" }
 * constraint (the 'empty-body-on-idle' branch fails). Extract<> narrows the union BEFORE
 * indexing into `cause`, producing the correct 3-variant union.
 */
function assertSaveValidationCauseExhaustive(
  cause: Extract<SaveValidationErrorDelta, { kind: "invariant-violated" }>["cause"],
): "note-not-in-feed" | "hydration-failed" | "frontmatter-invariant" {
  switch (cause) {
    case "note-not-in-feed":
      return "note-not-in-feed";
    case "hydration-failed":
      return "hydration-failed";
    case "frontmatter-invariant":
      return "frontmatter-invariant";
    default: {
      // TypeScript infers cause as never here if and only if all 3 variants are handled.
      // Adding a 4th variant to SaveValidationErrorDelta['cause'] would break compilation here.
      const _never: never = cause;
      return _never;
    }
  }
}

// Negative compile-time guard: a not-allowed cause must be rejected at the type level.
// We pass the string directly (no cast) so TypeScript raises an error.
// If the parameter type were `never`, TypeScript would also raise an error but for a
// different reason (nothing is assignable to never). Using the raw string literal
// exercises the actual 3-variant discriminator.
// @ts-expect-error — "totally-fake-cause" is not in the 3-variant cause union
assertSaveValidationCauseExhaustive("totally-fake-cause");

// ── PROP-TCU-007 ─────────────────────────────────────────────────────────

describe("PROP-TCU-007(a): SaveErrorDelta is exhaustive — exactly 'validation' and 'fs'", () => {
  test("Tier-0 compile-time proof: assertSaveErrorDeltaExhaustive compiles", () => {
    expect(typeof assertSaveErrorDeltaExhaustive).toBe("function");
  });

  test("kind='validation' is handled", () => {
    const err: SaveErrorDelta = {
      kind: "validation",
      reason: { kind: "empty-body-on-idle" },
    };
    expect(assertSaveErrorDeltaExhaustive(err)).toBe("validation");
  });

  test("kind='fs' is handled", () => {
    const err: SaveErrorDelta = {
      kind: "fs",
      reason: { kind: "unknown", detail: "test" },
    };
    expect(assertSaveErrorDeltaExhaustive(err)).toBe("fs");
  });
});

describe("PROP-TCU-007(b): SaveValidationError.cause exhaustive — exactly 3 causes (no 'tag-vo-invalid')", () => {
  test("Tier-0 compile-time proof: assertSaveValidationCauseExhaustive compiles with exactly 3 causes", () => {
    expect(typeof assertSaveValidationCauseExhaustive).toBe("function");
  });

  test("cause='note-not-in-feed' is handled", () => {
    expect(assertSaveValidationCauseExhaustive("note-not-in-feed")).toBe("note-not-in-feed");
  });

  test("cause='hydration-failed' is handled", () => {
    expect(assertSaveValidationCauseExhaustive("hydration-failed")).toBe("hydration-failed");
  });

  test("cause='frontmatter-invariant' is handled", () => {
    expect(assertSaveValidationCauseExhaustive("frontmatter-invariant")).toBe("frontmatter-invariant");
  });
});

describe("PROP-TCU-007(c): per-cause variant tests — error shapes", () => {
  test("'note-not-in-feed' cause is constructable and round-trips through assertSaveErrorDelta", () => {
    const err: SaveErrorDelta = {
      kind: "validation",
      reason: {
        kind: "invariant-violated",
        cause: "note-not-in-feed",
        detail: "note not in feed: 2026-04-30-120000-001",
      },
    };
    expect(assertSaveErrorDeltaExhaustive(err)).toBe("validation");
    if (err.kind !== "validation") return;
    expect(err.reason.kind).toBe("invariant-violated");
    if (err.reason.kind !== "invariant-violated") return;
    expect(err.reason.cause).toBe("note-not-in-feed");
  });

  test("'hydration-failed' cause is constructable and round-trips through assertSaveErrorDelta", () => {
    const err: SaveErrorDelta = {
      kind: "validation",
      reason: {
        kind: "invariant-violated",
        cause: "hydration-failed",
        detail: "hydration failed for snapshot: 2026-04-30-120000-001",
      },
    };
    expect(assertSaveErrorDeltaExhaustive(err)).toBe("validation");
    if (err.kind !== "validation") return;
    expect(err.reason.kind).toBe("invariant-violated");
    if (err.reason.kind !== "invariant-violated") return;
    expect(err.reason.cause).toBe("hydration-failed");
  });

  test("'frontmatter-invariant' cause is constructable and round-trips through assertSaveErrorDelta", () => {
    const err: SaveErrorDelta = {
      kind: "validation",
      reason: {
        kind: "invariant-violated",
        cause: "frontmatter-invariant",
        detail: "timestamp invariant violated: updatedAt before createdAt",
      },
    };
    expect(assertSaveErrorDeltaExhaustive(err)).toBe("validation");
    if (err.kind !== "validation") return;
    expect(err.reason.kind).toBe("invariant-violated");
    if (err.reason.kind !== "invariant-violated") return;
    expect(err.reason.cause).toBe("frontmatter-invariant");
  });

  test("'empty-body-on-idle' validation reason is preserved (unchanged canonical variant)", () => {
    const err: SaveErrorDelta = {
      kind: "validation",
      reason: { kind: "empty-body-on-idle" },
    };
    if (err.kind !== "validation") return;
    expect(err.reason.kind).toBe("empty-body-on-idle");
  });
});
