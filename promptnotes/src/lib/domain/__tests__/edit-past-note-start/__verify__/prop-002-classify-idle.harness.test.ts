/**
 * PROP-EPNS-002: classifyCurrentSession(IdleState, null) always returns { kind: 'no-current' }
 * Tier 1 — fast-check 1000 runs
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type { IdleState } from "promptnotes-domain-types/capture/states";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

describe("PROP-EPNS-002: idle → no-current", () => {
  test("∀ IdleState, result.kind === 'no-current' (1000 runs)", () => {
    // IdleState has only one shape: { status: 'idle' }
    // But we run 1000 times to confirm purity across invocations
    fc.assert(
      fc.property(fc.constant({ status: "idle" as const } satisfies IdleState), (state) => {
        const result = classifyCurrentSession(state, null);
        expect(result.kind).toBe("no-current");
      }),
      { numRuns: 1000 },
    );
  });
});
