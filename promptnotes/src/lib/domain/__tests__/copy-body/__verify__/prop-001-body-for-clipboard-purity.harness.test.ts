/**
 * PROP-001: bodyForClipboard is pure (referentially transparent).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * ∀ note: bodyForClipboard(note) === bodyForClipboard(note)
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import { arbNote } from "./_arbitraries";

describe("PROP-001: bodyForClipboard purity", () => {
  test("∀ note: bodyForClipboard(note) === bodyForClipboard(note)", () => {
    fc.assert(
      fc.property(arbNote(), (note) => {
        const a = bodyForClipboard(note);
        const b = bodyForClipboard(note);
        return a === b;
      }),
      { numRuns: 1000, seed: 42 },
    );
  });

  test("∀ note: three calls produce identical strings", () => {
    fc.assert(
      fc.property(arbNote(), (note) => {
        const xs = [bodyForClipboard(note), bodyForClipboard(note), bodyForClipboard(note)];
        return xs.every((x) => x === xs[0]);
      }),
      { numRuns: 200, seed: 7 },
    );
  });
});
