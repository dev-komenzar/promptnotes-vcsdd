/**
 * PROP-DLN-013 / PROP-DLN-014: Event channel membership.
 *
 * Tier 0 — TypeScript type-level proof.
 * Required: false (PROP-DLN-013), false (PROP-DLN-014 runtime complement)
 *
 * Proof obligations:
 * - DeleteNoteRequested ∈ PublicDomainEvent
 * - NoteFileDeleted ∈ PublicDomainEvent
 * - NoteDeletionFailed ∈ PublicDomainEvent
 * - TagInventoryUpdated ∈ CurateInternalEvent
 * - TagInventoryUpdated ∉ PublicDomainEvent (it is internal only)
 * - NoteDeletionRequestedInternal ∈ CurateInternalEvent (UI-layer, out of scope for this workflow)
 * - NoteDeletionConfirmedInternal ∈ CurateInternalEvent (UI-layer, out of scope)
 * - NoteDeletionCanceled ∈ CurateInternalEvent (UI-layer, out of scope)
 *
 * Covers: REQ-DLN-009
 *
 * Note: This is a pure compile-time test. No imports from implementation files needed.
 */

import { describe, test, expect } from "bun:test";
import type {
  DeleteNoteRequested,
  NoteFileDeleted,
  NoteDeletionFailed,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type {
  CurateInternalEvent,
  TagInventoryUpdated,
  NoteDeletionRequestedInternal,
  NoteDeletionConfirmedInternal,
  NoteDeletionCanceled,
} from "promptnotes-domain-types/curate/internal-events";

// ── Tier 0: TypeScript type-level membership assertions ───────────────────

/**
 * PublicDomainEvent membership proofs.
 * Extract<Union, { kind: K }> is non-never when K is a member of Union.
 */
type DeleteNoteRequestedIsPublic = Extract<PublicDomainEvent, { kind: "delete-note-requested" }> extends never
  ? never
  : true;
type NoteFileDeletedIsPublic = Extract<PublicDomainEvent, { kind: "note-file-deleted" }> extends never
  ? never
  : true;
type NoteDeletionFailedIsPublic = Extract<PublicDomainEvent, { kind: "note-deletion-failed" }> extends never
  ? never
  : true;

/** TagInventoryUpdated must NOT be in PublicDomainEvent. */
type TagInventoryUpdatedIsNotPublic = Extract<PublicDomainEvent, { kind: "tag-inventory-updated" }> extends never
  ? true
  : never;

/**
 * CurateInternalEvent membership proofs.
 */
type TagInventoryUpdatedIsInternal = Extract<CurateInternalEvent, { kind: "tag-inventory-updated" }> extends never
  ? never
  : true;
type NoteDeletionRequestedInternalIsInternal = Extract<
  CurateInternalEvent,
  { kind: "note-deletion-requested-internal" }
> extends never
  ? never
  : true;
type NoteDeletionConfirmedInternalIsInternal = Extract<
  CurateInternalEvent,
  { kind: "note-deletion-confirmed-internal" }
> extends never
  ? never
  : true;
type NoteDeletionCanceledIsInternal = Extract<
  CurateInternalEvent,
  { kind: "note-deletion-canceled" }
> extends never
  ? never
  : true;

// Assign to prove the types are 'true' (not 'never') at compile time
const _deleteNoteRequestedIsPublic: DeleteNoteRequestedIsPublic = true;
const _noteFileDeletedIsPublic: NoteFileDeletedIsPublic = true;
const _noteDeletionFailedIsPublic: NoteDeletionFailedIsPublic = true;
const _tagInventoryUpdatedIsNotPublic: TagInventoryUpdatedIsNotPublic = true;
const _tagInventoryUpdatedIsInternal: TagInventoryUpdatedIsInternal = true;
const _noteDeletionRequestedInternalIsInternal: NoteDeletionRequestedInternalIsInternal = true;
const _noteDeletionConfirmedInternalIsInternal: NoteDeletionConfirmedInternalIsInternal = true;
const _noteDeletionCanceledIsInternal: NoteDeletionCanceledIsInternal = true;

// ── PROP-DLN-013: Public event channel membership ────────────────────────

describe("PROP-DLN-013: Public event channel membership", () => {
  test("Tier-0: DeleteNoteRequested ∈ PublicDomainEvent (kind: 'delete-note-requested')", () => {
    expect(_deleteNoteRequestedIsPublic).toBe(true);
  });

  test("Tier-0: NoteFileDeleted ∈ PublicDomainEvent (kind: 'note-file-deleted')", () => {
    expect(_noteFileDeletedIsPublic).toBe(true);
  });

  test("Tier-0: NoteDeletionFailed ∈ PublicDomainEvent (kind: 'note-deletion-failed')", () => {
    expect(_noteDeletionFailedIsPublic).toBe(true);
  });

  test("Tier-0: TagInventoryUpdated ∉ PublicDomainEvent (it is internal-only)", () => {
    expect(_tagInventoryUpdatedIsNotPublic).toBe(true);
  });

  test("runtime: can construct DeleteNoteRequested and assign to PublicDomainEvent", () => {
    const event: PublicDomainEvent = {
      kind: "delete-note-requested",
      noteId: "id-001" as never,
      occurredOn: { epochMillis: 5000 } as never,
    };
    expect(event.kind).toBe("delete-note-requested");
  });

  test("runtime: can construct NoteFileDeleted and assign to PublicDomainEvent", () => {
    const event: PublicDomainEvent = {
      kind: "note-file-deleted",
      noteId: "id-001" as never,
      frontmatter: { tags: [], createdAt: { epochMillis: 1000 } as never, updatedAt: { epochMillis: 2000 } as never } as never,
      occurredOn: { epochMillis: 5000 } as never,
    };
    expect(event.kind).toBe("note-file-deleted");
  });

  test("runtime: can construct NoteDeletionFailed and assign to PublicDomainEvent", () => {
    const event: PublicDomainEvent = {
      kind: "note-deletion-failed",
      noteId: "id-001" as never,
      reason: "permission",
      occurredOn: { epochMillis: 5000 } as never,
    };
    expect(event.kind).toBe("note-deletion-failed");
  });
});

// ── Internal event channel membership ────────────────────────────────────

describe("PROP-DLN-013: Internal event channel membership (CurateInternalEvent)", () => {
  test("Tier-0: TagInventoryUpdated ∈ CurateInternalEvent", () => {
    expect(_tagInventoryUpdatedIsInternal).toBe(true);
  });

  test("Tier-0: NoteDeletionRequestedInternal ∈ CurateInternalEvent (UI-layer, not emitted by this workflow)", () => {
    expect(_noteDeletionRequestedInternalIsInternal).toBe(true);
  });

  test("Tier-0: NoteDeletionConfirmedInternal ∈ CurateInternalEvent (UI-layer, not emitted by this workflow)", () => {
    expect(_noteDeletionConfirmedInternalIsInternal).toBe(true);
  });

  test("Tier-0: NoteDeletionCanceled ∈ CurateInternalEvent (UI-layer, not emitted by this workflow)", () => {
    expect(_noteDeletionCanceledIsInternal).toBe(true);
  });

  test("runtime: can construct TagInventoryUpdated and assign to CurateInternalEvent", () => {
    const event: CurateInternalEvent = {
      kind: "tag-inventory-updated",
      addedTags: [],
      removedTags: ["draft" as never],
      occurredOn: { epochMillis: 5000 } as never,
    };
    expect(event.kind).toBe("tag-inventory-updated");
  });
});

// ── deps.publish vs deps.publishInternal routing ─────────────────────────

describe("PROP-DLN-013: event routing — publish vs publishInternal", () => {
  test("DeleteNoteRequested is assignable to PublicDomainEvent (routed via deps.publish)", () => {
    const event: DeleteNoteRequested = {
      kind: "delete-note-requested",
      noteId: "id-001" as never,
      occurredOn: { epochMillis: 5000 } as never,
    };
    // assignability proof: if DeleteNoteRequested ∉ PublicDomainEvent, this cast would fail
    const asPublic: PublicDomainEvent = event;
    expect(asPublic.kind).toBe("delete-note-requested");
  });

  test("TagInventoryUpdated is assignable to CurateInternalEvent (routed via deps.publishInternal)", () => {
    const event: TagInventoryUpdated = {
      kind: "tag-inventory-updated",
      addedTags: [],
      removedTags: [],
      occurredOn: { epochMillis: 5000 } as never,
    };
    const asInternal: CurateInternalEvent = event;
    expect(asInternal.kind).toBe("tag-inventory-updated");
  });
});
