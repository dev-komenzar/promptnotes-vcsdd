// capture-auto-save/update-projections.ts
// Step 4: updateProjections — refreshes Feed sort and TagInventory.
//
// REQ-011: Refreshes Feed and TagInventory (in-memory, no file I/O)
// REQ-012: TagInventoryUpdated emitted on tag delta

import type { Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";

export type UpdateProjectionsDeps = {
  readonly refreshSort: () => void;
  readonly applyTagDelta: (prev: Frontmatter | null, next: Frontmatter) => boolean;
  readonly publish: (event: { kind: string; [key: string]: unknown }) => void;
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
      deps.publish({ kind: "tag-inventory-updated" });
    }

    return { kind: "IndexedNote" };
  };
}
