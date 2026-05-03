/**
 * corrupted-banner.prop.test.ts — PROP-004 (fast-check)
 *
 * PROP-004: shouldShowCorruptedBanner(files) === (files.length >= 1)
 *   Tier 2: fast-check property test with arbitrary arrays
 *   Invariant: for ANY array of any elements, banner shown iff length >= 1
 *
 * RED PHASE: imports below MUST fail — module does not exist yet.
 */

import { describe, test } from "bun:test";
import * as fc from "fast-check";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import { shouldShowCorruptedBanner } from "$lib/ui/app-shell/corruptedBanner";

describe("PROP-004 (fast-check): shouldShowCorruptedBanner === (files.length >= 1)", () => {
  test("PROP-004: banner shown iff count >= 1 (arbitrary array, ≥100 runs)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything()),
        (files) => shouldShowCorruptedBanner(files) === (files.length >= 1)
      ),
      { numRuns: 200 }
    );
  });

  test("PROP-004: empty array always returns false (100 runs)", () => {
    fc.assert(
      fc.property(
        fc.constant([]),
        (files) => shouldShowCorruptedBanner(files) === false
      ),
      { numRuns: 100 }
    );
  });

  test("PROP-004: non-empty array always returns true (100 runs)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { minLength: 1, maxLength: 1000 }),
        (files) => shouldShowCorruptedBanner(files) === true
      ),
      { numRuns: 100 }
    );
  });

  test("PROP-004: result is always boolean (never undefined/null)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything()),
        (files) => typeof shouldShowCorruptedBanner(files) === "boolean"
      ),
      { numRuns: 200 }
    );
  });
});
