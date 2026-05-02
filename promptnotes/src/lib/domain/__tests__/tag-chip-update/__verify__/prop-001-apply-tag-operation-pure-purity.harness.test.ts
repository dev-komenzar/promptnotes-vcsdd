/**
 * PROP-TCU-001: applyTagOperationPure is pure — referential transparency.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ (note, command, now),
 *   applyTagOperationPure(note, command, now) deepEquals applyTagOperationPure(note, command, now)
 *
 * Covers: REQ-TCU-001, REQ-TCU-002, REQ-TCU-012
 *
 * RED phase: imports from non-existent implementation file.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { TagChipCommand } from "promptnotes-domain-types/curate/stages";

import { applyTagOperationPure } from "../../../tag-chip-update/apply-tag-operation-pure";

// ── Arbitraries ───────────────────────────────────────────────────────────

function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000, max: 2_000_000_000 })
    .map((ms) => ({ epochMillis: ms } as unknown as Timestamp));
}

function arbTag(): fc.Arbitrary<Tag> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

function arbFrontmatter(opts?: { minCreatedAt?: number }): fc.Arbitrary<Frontmatter> {
  const minCreated = opts?.minCreatedAt ?? 1_000;
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: fc.integer({ min: minCreated, max: 1_000_000_000 }),
    })
    .chain(({ tags, createdAt }) =>
      fc
        .integer({ min: createdAt, max: createdAt + 1_000_000 })
        .map((updatedAt) => ({
          tags,
          createdAt: { epochMillis: createdAt } as unknown as Timestamp,
          updatedAt: { epochMillis: updatedAt } as unknown as Timestamp,
        }))
    )
    .map((fm) => fm as unknown as Frontmatter);
}

function arbNote(): fc.Arbitrary<Note> {
  return fc
    .record({
      id: fc
        .stringMatching(/^[a-z0-9-]{10,30}$/)
        .map((s) => s as unknown as NoteId),
      frontmatter: arbFrontmatter(),
    })
    .map(({ id, frontmatter }) => ({
      id,
      body: "body" as unknown,
      frontmatter,
    } as Note));
}

function arbTagChipCommand(noteId: NoteId): fc.Arbitrary<TagChipCommand> {
  return fc.record({
    kind: fc.constantFrom("add" as const, "remove" as const),
    tag: arbTag(),
  }).map(({ kind, tag }) => ({ kind, noteId, tag }));
}

// ── PROP-TCU-001 ─────────────────────────────────────────────────────────

describe("PROP-TCU-001: applyTagOperationPure is pure (referential transparency)", () => {
  test("∀ (note, command, now): result deepEquals result on second call", () => {
    fc.assert(
      fc.property(
        arbNote().chain((note) =>
          fc.tuple(
            fc.constant(note),
            arbTagChipCommand(note.id),
            // Use a timestamp >= note.frontmatter.createdAt to avoid invariant violation
            fc
              .integer({ min: 1_000_000, max: 2_000_000_000 })
              .map((ms) => ({ epochMillis: ms } as unknown as Timestamp)),
          )
        ),
        ([note, command, now]) => {
          const first = applyTagOperationPure(note, command, now);
          const second = applyTagOperationPure(note, command, now);
          return JSON.stringify(first) === JSON.stringify(second);
        },
      ),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ (note, command, now): ok status is identical across two invocations", () => {
    fc.assert(
      fc.property(
        arbNote().chain((note) =>
          fc.tuple(
            fc.constant(note),
            arbTagChipCommand(note.id),
            fc
              .integer({ min: 1_000_000, max: 2_000_000_000 })
              .map((ms) => ({ epochMillis: ms } as unknown as Timestamp)),
          )
        ),
        ([note, command, now]) => {
          const r1 = applyTagOperationPure(note, command, now);
          const r2 = applyTagOperationPure(note, command, now);
          return r1.ok === r2.ok;
        },
      ),
      { numRuns: 100, seed: 7 },
    );
  });
});
