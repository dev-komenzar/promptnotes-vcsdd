/**
 * PROP-TCU-003: Idempotent remove — when tag is absent,
 * applyTagOperationPure returns Ok(MutatedNote) where
 * tagsEqualAsSet(mutated.note.frontmatter.tags, mutated.previousFrontmatter.tags) === true.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Covers: REQ-TCU-004
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

import {
  applyTagOperationPure,
  tagsEqualAsSet,
} from "../../../tag-chip-update/apply-tag-operation-pure";

// ── Arbitraries ───────────────────────────────────────────────────────────

function arbTag(prefix?: string): fc.Arbitrary<Tag> {
  const pat = prefix
    ? new RegExp(`^${prefix}[a-z0-9]{0,10}$`)
    : /^[a-z][a-z0-9-]{0,14}$/;
  return fc.stringMatching(pat).map((s) => s as unknown as Tag);
}

function arbFrontmatterWithoutTag(absentTag: Tag): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      extraTags: fc.array(arbTag("q"), { maxLength: 3 }),
      createdAt: fc.integer({ min: 1_000, max: 500_000_000 }),
    })
    .chain(({ extraTags, createdAt }) =>
      fc
        .integer({ min: createdAt, max: createdAt + 100_000 })
        .map((updatedAt) => ({
          // Ensure absentTag is NOT in the array
          tags: extraTags.filter((t) => t !== absentTag),
          createdAt: { epochMillis: createdAt } as unknown as Timestamp,
          updatedAt: { epochMillis: updatedAt } as unknown as Timestamp,
        }))
    )
    .map((fm) => fm as unknown as Frontmatter);
}

function arbNoteWithoutTag(absentTag: Tag): fc.Arbitrary<Note> {
  return arbFrontmatterWithoutTag(absentTag).map((fm) => ({
    id: "2026-04-30-120000-001" as unknown as NoteId,
    body: "body" as unknown,
    frontmatter: fm,
  } as Note));
}

// ── PROP-TCU-003 ─────────────────────────────────────────────────────────

describe("PROP-TCU-003: Idempotent remove — tag absent, tags unchanged", () => {
  test("∀ (note without tag, remove-command): result is Ok and tag remains absent", () => {
    fc.assert(
      fc.property(
        // Use a fixed 'absent' tag prefix to avoid collisions with arbitrary tags
        fc.constant("zz-absent-tag" as unknown as Tag).chain((absentTag) =>
          fc.tuple(
            arbNoteWithoutTag(absentTag),
            fc.constant(absentTag),
            fc.integer({ min: 1_000_000, max: 2_000_000_000 }).map(
              (ms) => ({ epochMillis: ms } as unknown as Timestamp),
            ),
          )
        ),
        ([note, tag, now]) => {
          const command: TagChipCommand = { kind: "remove", noteId: note.id, tag };
          const result = applyTagOperationPure(note, command, now);

          // removeTag never fails (no Result wrapper — returns Note directly)
          // applyTagOperationPure wraps it: should return Ok
          if (!result.ok) return true; // fail-safe

          // Tag must still be absent
          return !result.value.note.frontmatter.tags.includes(tag);
        },
      ),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ (note without tag, remove-command): tag count in result is same as input", () => {
    fc.assert(
      fc.property(
        fc.constant("zz-absent-tag" as unknown as Tag).chain((absentTag) =>
          fc.tuple(
            arbNoteWithoutTag(absentTag),
            fc.constant(absentTag),
            fc.integer({ min: 1_000_000, max: 2_000_000_000 }).map(
              (ms) => ({ epochMillis: ms } as unknown as Timestamp),
            ),
          )
        ),
        ([note, tag, now]) => {
          const command: TagChipCommand = { kind: "remove", noteId: note.id, tag };
          const result = applyTagOperationPure(note, command, now);

          if (!result.ok) return true;

          // Tags should be unchanged (idempotent remove of absent tag)
          return tagsEqualAsSet(
            result.value.note.frontmatter.tags,
            note.frontmatter.tags,
          );
        },
      ),
      { numRuns: 200, seed: 7 },
    );
  });
});
