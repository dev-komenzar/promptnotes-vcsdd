// capture-auto-save/update-projections.ts
// Step 4: updateProjections — refreshes Feed sort and TagInventory.
//
// REQ-011: Refreshes Feed and TagInventory (in-memory, no file I/O)
// REQ-012: TagInventoryUpdated emitted on tag delta
//
// TagInventoryUpdated is a Curate-internal event, NOT a PublicDomainEvent.
// It is emitted via a separate internal callback, not the public event bus.

import type { Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";

/** Curate-internal event (not in PublicDomainEvent union). */
export type TagInventoryUpdated = {
  readonly kind: "tag-inventory-updated";
};

export type UpdateProjectionsDeps = {
  readonly refreshSort: () => void;
  readonly applyTagDelta: (prev: Frontmatter | null, next: Frontmatter) => boolean;
  readonly emitInternal: (event: TagInventoryUpdated) => void;
};

export type IndexedNote = {
  readonly kind: "IndexedNote";
};

export function updateProjections(
  deps: UpdateProjectionsDeps,
): (saved: NoteFileSaved) => IndexedNote {
  return (saved: NoteFileSaved): IndexedNote => {
    // REQ-011: refresh Feed sort
    deps.refreshSort();

    // REQ-012: check for tag delta and emit if changed
    const tagsChanged = deps.applyTagDelta(saved.previousFrontmatter, saved.frontmatter);
    if (tagsChanged) {
      deps.emitInternal({ kind: "tag-inventory-updated" });
    }

    return { kind: "IndexedNote" };
  };
}
