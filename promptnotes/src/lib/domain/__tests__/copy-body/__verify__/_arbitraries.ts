/**
 * Shared fast-check arbitraries for CopyBody property tests.
 */

import fc from "fast-check";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";

export function arbTimestamp(): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min: 1_000_000, max: 2_000_000_000 })
    .map((ms) => ({ epochMillis: ms }) as unknown as Timestamp);
}

export function arbTag(): fc.Arbitrary<Tag> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

export function arbFrontmatter(): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(),
      updatedAt: arbTimestamp(),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

export function arbBody(): fc.Arbitrary<Body> {
  return fc.string({ maxLength: 500 }).map((s) => s as unknown as Body);
}

export function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

export function arbNote(): fc.Arbitrary<Note> {
  return fc.record({
    id: arbNoteId(),
    body: arbBody(),
    frontmatter: arbFrontmatter(),
  });
}

/**
 * Generates an (EditingState, Note) pair where note.id === state.currentNoteId
 * (REQ-012 caller invariant).
 */
export function arbStateAndNote(): fc.Arbitrary<{ state: EditingState; note: Note }> {
  return arbNote().map((note) => ({
    state: {
      status: "editing",
      currentNoteId: note.id,
      isDirty: false,
      lastInputAt: null,
      idleTimerHandle: null,
      lastSaveResult: null,
    } as EditingState,
    note,
  }));
}
