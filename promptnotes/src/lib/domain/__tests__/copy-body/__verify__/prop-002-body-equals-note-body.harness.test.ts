/**
 * PROP-002: Body identity — bodyForClipboard(note) === note.body (as string).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import { arbNote } from "./_arbitraries";

describe("PROP-002: bodyForClipboard returns note.body verbatim", () => {
  test("∀ note: bodyForClipboard(note) === (note.body as string)", () => {
    fc.assert(
      fc.property(arbNote(), (note) => {
        return bodyForClipboard(note) === (note.body as unknown as string);
      }),
      { numRuns: 1000, seed: 17 },
    );
  });
});
