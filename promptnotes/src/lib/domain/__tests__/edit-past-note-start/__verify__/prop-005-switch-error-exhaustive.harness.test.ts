/**
 * PROP-EPNS-005: SwitchError type exhaustiveness
 * Tier 0 — TypeScript compile-time check
 *
 * If SwitchError gains a new variant, this file FAILS to compile.
 */

import { describe, test, expect } from "bun:test";
import type { SwitchError } from "promptnotes-domain-types/shared/errors";

// Exhaustive switch — if a new SwitchError variant is added, the `never` branch
// will cause a TypeScript compile error.
function handleSwitchError(error: SwitchError): string {
  switch (error.kind) {
    case "save-failed-during-switch":
      return `Save failed: ${error.underlying.kind}, pending: ${error.pendingNextNoteId}`;
    default: {
      // If this compiles, SwitchError has exactly one variant
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

describe("PROP-EPNS-005: SwitchError type exhaustiveness", () => {
  test("SwitchError has exactly one variant: save-failed-during-switch", () => {
    // This test verifies the exhaustive handler compiles and runs correctly
    const testError: SwitchError = {
      kind: "save-failed-during-switch",
      underlying: { kind: "fs", reason: { kind: "permission" } },
      pendingNextNoteId: "test" as any,
    };
    const result = handleSwitchError(testError);
    expect(result).toContain("Save failed");
  });
});
