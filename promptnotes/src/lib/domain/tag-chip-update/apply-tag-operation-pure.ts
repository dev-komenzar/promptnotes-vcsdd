// tag-chip-update/apply-tag-operation-pure.ts
// Step 2 (pure core): Apply add/remove tag operation to a Note aggregate.
//
// REQ-TCU-001: addTag is called; tag appears in mutated frontmatter.
// REQ-TCU-002: removeTag is called; tag absent in mutated frontmatter.
// REQ-TCU-003: addTag is idempotent — if tag already present, returns Ok unchanged.
// REQ-TCU-004: removeTag is idempotent — if tag absent, returns Ok unchanged.
// REQ-TCU-007: NoteEditError from addTag maps to SaveErrorDelta with cause 'frontmatter-invariant'.
// REQ-TCU-009: previousFrontmatter is always the pre-mutation note.frontmatter.
//
// This function is the PROP-TCU-001 proof target: pure, no side effects.

import type { Note, NoteEditError } from "promptnotes-domain-types/shared/note";
import type { Tag, Timestamp, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { MutatedNote, TagChipCommand } from "promptnotes-domain-types/curate/stages";
import type { Result } from "promptnotes-domain-types/util/result";
import type { SaveErrorDelta } from "./_deltas.js";

// ── NoteOps inline implementations ────────────────────────────────────────
// The canonical NoteOps interface has no implementation (Phase 11+ per note.ts).
// We implement the required subset (addTag, removeTag) inline here.

function addTag(note: Note, tag: Tag, now: Timestamp): Result<Note, NoteEditError> {
  const fm = note.frontmatter;

  // Idempotent: tag already present → return unchanged note.
  if (fm.tags.includes(tag)) {
    return { ok: true, value: note };
  }

  // Guard: updatedAt must not precede createdAt.
  const createdMs = (fm.createdAt as unknown as { epochMillis: number }).epochMillis;
  const nowMs = (now as unknown as { epochMillis: number }).epochMillis;
  if (nowMs < createdMs) {
    const error: NoteEditError = {
      kind: "frontmatter",
      reason: { kind: "updated-before-created" },
    };
    return { ok: false, error };
  }

  const newFrontmatter = {
    ...fm,
    tags: [...fm.tags, tag],
    updatedAt: now,
  } as unknown as Frontmatter;

  const mutatedNote: Note = { ...note, frontmatter: newFrontmatter };
  return { ok: true, value: mutatedNote };
}

function removeTag(note: Note, tag: Tag, now: Timestamp): Note {
  const fm = note.frontmatter;
  const filtered = fm.tags.filter((t) => t !== tag);

  // Short-circuit: tag was absent — return original note unchanged.
  if (filtered.length === fm.tags.length) {
    return note;
  }

  const newFrontmatter = {
    ...fm,
    tags: filtered,
    updatedAt: now,
  } as unknown as Frontmatter;

  return { ...note, frontmatter: newFrontmatter };
}

// ── tagsEqualAsSet ────────────────────────────────────────────────────────
// PROP-TCU-002 / PROP-TCU-003: canonical idempotency predicate.
// Order-insensitive comparison; used by the pipeline's short-circuit guard.

export function tagsEqualAsSet(a: readonly Tag[], b: readonly Tag[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const t of b) {
    if (!setA.has(t)) return false;
  }
  return true;
}

// ── applyTagOperationPure ─────────────────────────────────────────────────

export function applyTagOperationPure(
  note: Note,
  command: TagChipCommand,
  now: Timestamp,
): Result<MutatedNote, SaveErrorDelta> {
  const previousFrontmatter = note.frontmatter;

  if (command.kind === "add") {
    const addResult = addTag(note, command.tag, now);
    if (!addResult.ok) {
      const err = addResult.error;
      // Only the 'frontmatter.updated-before-created' variant is reachable here
      // (command.tag is a pre-validated Tag brand — 'tag' variant is dead;
      // addTag is idempotent on duplicate — 'duplicate-tag' variant is dead).
      // We narrow to LiveAddTagError; the throw surfaces any future regression.
      if (err.kind === "frontmatter" && err.reason.kind === "updated-before-created") {
        // TypeScript narrows err.kind and err.reason.kind but not the full err type
        // (because FrontmatterError is a type alias, not an inline union on this member).
        // The runtime guard above is the proof; cast to LiveAddTagError is sound here.
        const liveErr = err as LiveAddTagError;
        return {
          ok: false,
          error: mapLiveAddTagErrorToSaveError(liveErr),
        };
      }
      // Dead variant reached at runtime — invariant violated.
      throw new Error(
        `invariant violated: addTag returned dead variant ${JSON.stringify(err)}`,
      );
    }
    const mutated: MutatedNote = {
      kind: "MutatedNote",
      note: addResult.value,
      previousFrontmatter,
    };
    return { ok: true, value: mutated };
  }

  // command.kind === "remove"
  const mutatedNote = removeTag(note, command.tag, now);
  const mutated: MutatedNote = {
    kind: "MutatedNote",
    note: mutatedNote,
    previousFrontmatter,
  };
  return { ok: true, value: mutated };
}

// ── LiveAddTagError — narrowed to the single reachable variant ────────────
// FIND-IMPL-TCU-002 / FIND-IMPL-TCU-004:
// In this workflow, `command.tag` is a pre-validated Tag brand, so NoteOps.addTag
// can only produce the 'updated-before-created' frontmatter error.
// The 'tag' variant and 'duplicate-tag' frontmatter reason are dead code here.
// Exporting allows the PROP-TCU-012 harness test to assert the dead-variant guarantee
// at the type level via @ts-expect-error.
//
// Note: `Extract<NoteEditError, { kind: "frontmatter"; reason: { kind: "updated-before-created" } }>`
// resolves to `never` because `reason: FrontmatterError` does not extend
// `reason: { kind: "updated-before-created" }` (FrontmatterError is a union including
// duplicate-tag). We therefore define LiveAddTagError explicitly as the narrow concrete type.
export type LiveAddTagError = {
  kind: "frontmatter";
  reason: { kind: "updated-before-created" };
};

// ── Error mapping ─────────────────────────────────────────────────────────

// FIND-IMPL-TCU-004: parameter narrowed to LiveAddTagError (not full NoteEditError union).
// If a dead variant (kind: 'tag' or frontmatter.duplicate-tag) ever reaches this call site,
// TypeScript will reject the call. The throw in applyTagOperationPure's call site handles
// any runtime regression caused by an 'as any' cast or future code change.
export function mapLiveAddTagErrorToSaveError(err: LiveAddTagError): SaveErrorDelta {
  return {
    kind: "validation",
    reason: {
      kind: "invariant-violated",
      cause: "frontmatter-invariant",
      detail: err.reason.kind,
    },
  };
}
