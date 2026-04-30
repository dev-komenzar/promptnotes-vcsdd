/**
 * PROP-005: SaveError type is exhaustive — only 'validation' or 'fs' kind values exist.
 *
 * Tier 0 — TypeScript type-level proof.
 * Required: true
 *
 * Proof strategy: compile-time exhaustiveness check via never branch in switch.
 * If a third variant is ever added to SaveError without updating the switch,
 * TypeScript compilation fails.
 *
 * Additionally: runtime check that only the two known kinds appear in practice.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type { SaveError, SaveValidationError, FsError } from "promptnotes-domain-types/shared/errors";

// ── Tier 0: TypeScript compile-time exhaustiveness proof ─────────────────

/**
 * This function is the type-level proof artifact.
 * If SaveError ever gains a third variant (e.g., { kind: "network" }),
 * the TypeScript compiler will reject this file with:
 *   "Type '{ kind: "network" }' is not assignable to type 'never'"
 *
 * The function never needs to be called — its existence and compilation is the proof.
 */
function assertSaveErrorExhaustive(error: SaveError): "validation" | "fs" {
  switch (error.kind) {
    case "validation":
      return "validation";
    case "fs":
      return "fs";
    default: {
      // This branch is unreachable if the type system is correct.
      // TypeScript infers _never as type 'never' — any new variant would cause a compile error.
      const _never: never = error;
      return _never;
    }
  }
}

/**
 * Same proof for SaveValidationError sub-type.
 * Only 'empty-body-on-idle' and 'invariant-violated' are valid.
 */
function assertSaveValidationErrorExhaustive(reason: SaveValidationError): "empty-body-on-idle" | "invariant-violated" {
  switch (reason.kind) {
    case "empty-body-on-idle":
      return "empty-body-on-idle";
    case "invariant-violated":
      return "invariant-violated";
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}

// ── Runtime verification of the type boundary ─────────────────────────────

describe("PROP-005: SaveError type exhaustiveness", () => {
  test("Tier 0 compile-time proof: assertSaveErrorExhaustive compiles without error", () => {
    // The existence of this compiled function is the proof.
    // If SaveError gains a third variant, compilation fails here.
    expect(typeof assertSaveErrorExhaustive).toBe("function");
  });

  test("assertSaveErrorExhaustive handles kind='validation'", () => {
    const err: SaveError = {
      kind: "validation",
      reason: { kind: "empty-body-on-idle" },
    };
    expect(assertSaveErrorExhaustive(err)).toBe("validation");
  });

  test("assertSaveErrorExhaustive handles kind='fs'", () => {
    const err: SaveError = {
      kind: "fs",
      reason: { kind: "unknown", detail: "test" },
    };
    expect(assertSaveErrorExhaustive(err)).toBe("fs");
  });

  test("SaveValidationError exhaustiveness: only 'empty-body-on-idle' and 'invariant-violated'", () => {
    const reason1: SaveValidationError = { kind: "empty-body-on-idle" };
    const reason2: SaveValidationError = { kind: "invariant-violated", detail: "ts < createdAt" };
    expect(assertSaveValidationErrorExhaustive(reason1)).toBe("empty-body-on-idle");
    expect(assertSaveValidationErrorExhaustive(reason2)).toBe("invariant-violated");
  });

  test("All known SaveError.kind values round-trip through assertSaveErrorExhaustive", () => {
    // fast-check over the finite set of known kinds
    fc.assert(
      fc.property(
        fc.constantFrom(
          { kind: "validation", reason: { kind: "empty-body-on-idle" } } as SaveError,
          { kind: "validation", reason: { kind: "invariant-violated", detail: "d" } } as SaveError,
          { kind: "fs", reason: { kind: "unknown", detail: "d" } } as SaveError,
          { kind: "fs", reason: { kind: "permission" } } as SaveError,
          { kind: "fs", reason: { kind: "disk-full" } } as SaveError,
          { kind: "fs", reason: { kind: "lock" } } as SaveError,
          { kind: "fs", reason: { kind: "not-found" } } as SaveError,
        ),
        (err) => {
          const result = assertSaveErrorExhaustive(err);
          return result === "validation" || result === "fs";
        },
      ),
      { numRuns: 100 },
    );
  });
});
