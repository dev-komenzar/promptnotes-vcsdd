/**
 * PROP-001: serializeNote is pure — same input always produces identical output.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ ValidatedSaveRequest input, serializeNote(input) === serializeNote(input)
 * This is referential transparency: identical inputs must produce identical outputs
 * regardless of invocation order or count.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { serializeNote } from "$lib/domain/capture-auto-save/serialize-note";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000_000, max: 2_000_000_000 })
    .map((ms) => ({ epochMillis: ms } as unknown as Timestamp));
}

function arbTag(): fc.Arbitrary<Tag> {
  // Tags are non-empty ascii alphanumeric strings (avoid YAML special chars)
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

function arbFrontmatter(): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(),
      updatedAt: arbTimestamp(),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

function arbBody(): fc.Arbitrary<Body> {
  // Allow arbitrary unicode strings including empty
  return fc.string({ maxLength: 500 }).map((s) => s as unknown as Body);
}

function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

function arbValidatedSaveRequest(): fc.Arbitrary<ValidatedSaveRequest> {
  return fc
    .record({
      noteId: arbNoteId(),
      body: arbBody(),
      frontmatter: arbFrontmatter(),
      trigger: fc.constantFrom("idle" as const, "blur" as const),
      requestedAt: arbTimestamp(),
    })
    .map(
      (r) =>
        ({
          kind: "ValidatedSaveRequest",
          noteId: r.noteId,
          body: r.body,
          frontmatter: r.frontmatter,
          previousFrontmatter: null,
          trigger: r.trigger,
          requestedAt: r.requestedAt,
        }) as ValidatedSaveRequest,
    );
}

// ── PROP-001 ───────────────────────────────────────────────────────────────

describe("PROP-001: serializeNote purity (referential transparency)", () => {
  test("∀ input: serializeNote(input) === serializeNote(input)", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const first = serializeNote(request);
        const second = serializeNote(request);
        return first === second;
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ input: calling serializeNote twice yields structurally identical strings", () => {
    fc.assert(
      fc.property(arbValidatedSaveRequest(), (request) => {
        const results = [serializeNote(request), serializeNote(request), serializeNote(request)];
        return results.every((r) => r === results[0]);
      }),
      { numRuns: 100, seed: 7 },
    );
  });
});
