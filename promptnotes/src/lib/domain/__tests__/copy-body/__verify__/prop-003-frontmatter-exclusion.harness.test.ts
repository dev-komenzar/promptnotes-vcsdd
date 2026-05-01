/**
 * PROP-003: Frontmatter exclusion — a sentinel tag in frontmatter does not
 * appear in the result when the body itself does not contain that sentinel.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";

const SENTINEL = "__SENTINEL_XYZ_42__";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const tag = (s: string): Tag => s as unknown as Tag;
const body = (s: string): Body => s as unknown as Body;

function arbNoteIdLocal(): fc.Arbitrary<NoteId> {
  return fc.stringMatching(/^[a-z0-9-]{10,30}$/).map(id);
}

/** Generates a body that never contains the sentinel. */
function arbBodyWithoutSentinel(): fc.Arbitrary<Body> {
  return fc
    .string({ maxLength: 500 })
    .filter((s) => !s.includes(SENTINEL))
    .map(body);
}

describe("PROP-003: frontmatter exclusion", () => {
  test("∀ note with sentinel-tag in frontmatter and sentinel-free body: result excludes sentinel", () => {
    fc.assert(
      fc.property(arbNoteIdLocal(), arbBodyWithoutSentinel(), (noteId, b) => {
        const note: Note = {
          id: noteId,
          body: b,
          frontmatter: {
            tags: [tag(SENTINEL)],
            createdAt: ts(1),
            updatedAt: ts(2),
          } as unknown as Frontmatter,
        };
        const out = bodyForClipboard(note);
        return !out.includes(SENTINEL);
      }),
      { numRuns: 500, seed: 31 },
    );
  });
});
