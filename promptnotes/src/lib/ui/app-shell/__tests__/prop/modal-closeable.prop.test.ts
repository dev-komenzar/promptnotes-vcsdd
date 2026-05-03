/**
 * modal-closeable.prop.test.ts — REQ-003, REQ-016, PROP-005 (fast-check)
 *
 * REQ-003: WHILE AppShellState ∈ {'Unconfigured', 'StartupError'} — modal is rendered,
 *   overlay/esc dismissal is disabled
 *
 * REQ-016: WHILE VaultSetupModal is open — focus trap, Esc disabled, overlay-click disabled
 *
 * PROP-005: isModalCloseable(state, trigger) invariants:
 *   - state ∈ {'Unconfigured', 'StartupError'} AND trigger ∈ {'overlay', 'esc'} → false
 *   - state ∈ {'Unconfigured', 'StartupError'} AND trigger === 'success' → true
 *
 * RED PHASE: imports below MUST fail — module does not exist yet.
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import {
  isModalCloseable,
  type AppShellState,
  type ModalCloseTrigger,
} from "$lib/ui/app-shell/modalClosePolicy";

type ModalState = Extract<AppShellState, "Unconfigured" | "StartupError">;
type NonModalState = Extract<AppShellState, "Loading" | "Configured" | "UnexpectedError">;

// ── PROP-005: fast-check state machine property tests ─────────────────────────

describe("PROP-005 (fast-check): isModalCloseable overlay/esc invariants", () => {
  test("PROP-005: overlay/esc NEVER closes modal in Unconfigured or StartupError (≥100 runs)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ModalState>("Unconfigured", "StartupError"),
        fc.constantFrom<ModalCloseTrigger>("overlay", "esc"),
        (state, trigger) => isModalCloseable(state, trigger) === false
      ),
      { numRuns: 100 }
    );
  });

  test("PROP-005: success trigger ALWAYS closes modal in Unconfigured or StartupError (≥100 runs)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ModalState>("Unconfigured", "StartupError"),
        (state) => isModalCloseable(state, "success") === true
      ),
      { numRuns: 100 }
    );
  });

  test("PROP-005: result is always a boolean (never throws)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ModalState>("Unconfigured", "StartupError"),
        fc.constantFrom<ModalCloseTrigger>("overlay", "esc", "success"),
        (state, trigger) => typeof isModalCloseable(state, trigger) === "boolean"
      ),
      { numRuns: 200 }
    );
  });
});

// ── PROP-005: Unit tests for specific (state, trigger) pairs ─────────────────

describe("PROP-005: isModalCloseable unit assertions (all (state, trigger) combinations)", () => {
  test("isModalCloseable('Unconfigured', 'overlay') === false", () => {
    expect(isModalCloseable("Unconfigured", "overlay")).toBe(false);
  });

  test("isModalCloseable('Unconfigured', 'esc') === false", () => {
    expect(isModalCloseable("Unconfigured", "esc")).toBe(false);
  });

  test("isModalCloseable('Unconfigured', 'success') === true", () => {
    expect(isModalCloseable("Unconfigured", "success")).toBe(true);
  });

  test("isModalCloseable('StartupError', 'overlay') === false", () => {
    expect(isModalCloseable("StartupError", "overlay")).toBe(false);
  });

  test("isModalCloseable('StartupError', 'esc') === false", () => {
    expect(isModalCloseable("StartupError", "esc")).toBe(false);
  });

  test("isModalCloseable('StartupError', 'success') === true", () => {
    expect(isModalCloseable("StartupError", "success")).toBe(true);
  });
});

// ── REQ-003 edge cases ────────────────────────────────────────────────────────

describe("REQ-003 edge cases: overlay-click and Esc are disabled in modal states", () => {
  test("REQ-016: Esc key is disabled in Unconfigured state", () => {
    expect(isModalCloseable("Unconfigured", "esc")).toBe(false);
  });

  test("REQ-016: Esc key is disabled in StartupError state", () => {
    expect(isModalCloseable("StartupError", "esc")).toBe(false);
  });

  test("REQ-016: overlay click is disabled in Unconfigured state", () => {
    expect(isModalCloseable("Unconfigured", "overlay")).toBe(false);
  });

  test("REQ-016: overlay click is disabled in StartupError state", () => {
    expect(isModalCloseable("StartupError", "overlay")).toBe(false);
  });
});
