/**
 * PROP-028: CaptureAutoSave type signature compile-time assertion (Tier 0).
 *
 * TypeScript type-level test: asserts that the runtime `captureAutoSave` function
 * has the canonical type signature:
 *   (deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>
 *
 * If the signature drifts (wrong parameter order, wrong state type, missing deps),
 * TypeScript compilation fails — even if the tests themselves never run.
 *
 * Tier 0 — compile-time proof.
 * Required: true (REQ-017, FIND-019)
 *
 * This approach uses the `Equal<X, Y>` + `Assert<T>` helper pattern:
 *   type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
 *   type Assert<T extends true> = T
 *
 * If the types are not identical, `Assert<Equal<...>>` fails to compile.
 *
 * RED phase: tests fail because `captureAutoSave` (or `makeCaptureAutoSavePipeline`)
 * does NOT expose a canonical `(deps: CaptureDeps) => ...` shape — the current
 * implementation uses the flat `CaptureAutoSavePorts` convenience wrapper, which
 * does not conform to the canonical `CaptureAutoSave` type from workflows.ts.
 *
 * Note: The canonical CaptureAutoSave type is:
 *   (deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>
 *
 * The `makeCaptureAutoSavePipeline` function from pipeline.ts partially conforms
 * but its return type uses the combined `PipelineInfra & CaptureDeps` shape.
 * The PROP-028 assertion targets the canonical function as exported by the module
 * under the name `canonicalCaptureAutoSave`.
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type { SaveError, FsError } from "promptnotes-domain-types/shared/errors";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { CaptureDeps } from "promptnotes-domain-types/capture/ports";
import type { CaptureAutoSave } from "promptnotes-domain-types/capture/workflows";
import type { Timestamp, NoteId } from "promptnotes-domain-types/shared/value-objects";

// ── Type-level equality helpers ───────────────────────────────────────────

/**
 * Structural type equality using the conditional type trick.
 * Returns `true` iff X and Y are mutually assignable and have identical
 * conditional type behavior.
 *
 * Source: Matt Pocock's "Equal" utility, widely used in type-level testing.
 */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;

/**
 * Compile-time assertion: if T is not `true`, the type system raises an error.
 * Use as: type _check = Assert<Equal<A, B>>
 */
type Assert<T extends true> = T;

// ── Import under test (will fail RED if not exported) ────────────────────
// The canonical implementation MUST export a function named `canonicalCaptureAutoSave`
// that conforms to the `CaptureAutoSave` type from workflows.ts.
//
// REQ-017: The function signature is:
//   (deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>
import { canonicalCaptureAutoSave } from "$lib/domain/capture-auto-save/pipeline";

// ── PROP-028: Tier 0 compile-time type assertion ───────────────────────────

/**
 * This type alias is the compile-time proof artifact.
 *
 * If `canonicalCaptureAutoSave` does NOT conform to the `CaptureAutoSave` type,
 * TypeScript compilation fails here with a type error like:
 *   "Type 'false' does not satisfy the constraint 'true'"
 *
 * This happens BEFORE any test runs — compilation IS the test.
 */
type _CaptureAutoSaveSignatureCheck = Assert<
  Equal<typeof canonicalCaptureAutoSave, CaptureAutoSave>
>;

// ── Runtime test: the function exists and is callable ─────────────────────

describe("PROP-028: CaptureAutoSave type signature compile-time assertion (Tier 0)", () => {
  test("Tier 0 compile-time proof: canonicalCaptureAutoSave compiles with canonical CaptureAutoSave type", () => {
    // If this file compiles, the type assertion above passed.
    // The runtime test merely confirms the export exists.
    expect(typeof canonicalCaptureAutoSave).toBe("function");
  });

  test("canonicalCaptureAutoSave(deps) returns a function (curried first application)", () => {
    // Minimal test of curried application — confirms runtime shape matches signature
    const mockDeps: CaptureDeps = {
      clockNow: () => ({ epochMillis: 1000 } as unknown as Timestamp),
      allocateNoteId: (_ts: Timestamp) => "test-id" as unknown as NoteId,
      clipboardWrite: (_text: string) => ({ ok: true, value: undefined } as Result<void, FsError>),
      publish: (_event) => {},
    };
    // Type assertion: the result of applying deps is a function
    // (we don't call it — just check the shape)
    const bound = canonicalCaptureAutoSave(mockDeps);
    expect(typeof bound).toBe("function");
  });

  test("canonical signature: takes CaptureDeps, returns (EditingState, trigger) => Promise", () => {
    // This test documents the expected signature shape in a human-readable form.
    // The compile-time assertion above is the actual enforcement mechanism.
    const signatureDescription = "(deps: CaptureDeps) => (state: EditingState, trigger: \"idle\" | \"blur\") => Promise<Result<NoteFileSaved, SaveError>>";
    expect(typeof signatureDescription).toBe("string");
    // If this file compiled, the type matches.
    expect(typeof canonicalCaptureAutoSave).toBe("function");
  });
});
