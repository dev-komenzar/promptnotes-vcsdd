// delete-note/update-projections.ts
// Step 4 (pure core): Update Feed and TagInventory projections after note deletion.
//
// REQ-DLN-001: Happy path — updateProjectionsAfterDelete called and returns UpdatedProjection
// REQ-DLN-010: TagInventoryUpdated emission rule (ORCHESTRATOR calls publishInternal; this function does NOT)
// REQ-DLN-012: Projection update correctness — Feed and TagInventory
//
// PROP-DLN-010(d): updateProjectionsAfterDelete does NOT call deps.publishInternal
// PROP-DLN-012: updateProjectionsAfterDelete is pure (same inputs → same output)
// PROP-DLN-016: updateProjectionsAfterDelete invokes no port — primary enforcement for FIND-SPEC-DLN-001
//
// Pure function: (feed, inventory, event) => UpdatedProjection.
// NO deps curry. NO port calls. NO event emissions. Sources now from event.occurredOn.

import type { Frontmatter, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileDeleted } from "promptnotes-domain-types/shared/events";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory, TagEntry } from "promptnotes-domain-types/curate/read-models";
import type { UpdatedProjection } from "promptnotes-domain-types/curate/stages";
import type { NoteId } from "promptnotes-domain-types/shared/value-objects";

// ── FeedOps.removeNoteRef inline implementation ───────────────────────────────
// Returns a new Feed with the given noteId removed from noteRefs.
// Immutable: does not mutate the input feed.

function feedRemoveNoteRef(feed: Feed, noteId: NoteId): Feed {
  return {
    ...feed,
    noteRefs: feed.noteRefs.filter((ref) => String(ref) !== String(noteId)),
  };
}

// ── TagInventoryOps.applyNoteDeleted inline implementation ────────────────────
// Decrements usageCount for each tag in frontmatter.tags.
// Tags whose usageCount reaches 0 are pruned per aggregates.md §3 invariant 1 (usageCount > 0).
// Returns a new TagInventory. Immutable: does not mutate the input inventory.

function tagInventoryApplyNoteDeleted(
  inventory: TagInventory,
  frontmatter: Frontmatter,
  now: Timestamp,
): TagInventory {
  let entries = [...inventory.entries];

  for (const tag of frontmatter.tags) {
    const idx = entries.findIndex((e) => String(e.name) === String(tag));
    if (idx >= 0) {
      const newCount = entries[idx].usageCount - 1;
      if (newCount > 0) {
        // Decrement — entry remains
        entries[idx] = { name: entries[idx].name, usageCount: newCount };
      } else {
        // Prune — usageCount reached 0, remove the entry
        entries = entries.filter((_, i) => i !== idx);
      }
    }
    // Tag not found in inventory — no-op (defensive: inventory may lag behind snapshot)
  }

  return { entries, lastBuiltAt: now };
}

// ── updateProjectionsAfterDelete ──────────────────────────────────────────────
// Pure function. Signature: (feed, inventory, event) => UpdatedProjection.
// No deps parameter — verified by PROP-DLN-016.
// Called on: happy path (trash succeeds) and not-found graceful path.
// NOT called on: permission, lock, disk-full, unknown fs-error paths.
//
// Sources now from event.occurredOn (equals the orchestrator's single Clock.now()
// by the occurredOn threading invariant — PROP-DLN-005 / REQ-DLN-007).

export function updateProjectionsAfterDelete(
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileDeleted,
): UpdatedProjection {
  // Remove the deleted note from Feed — REQ-DLN-012
  const newFeed = feedRemoveNoteRef(feed, event.noteId);

  // Decrement TagInventory for deleted note's tags — REQ-DLN-012
  // Sources now from event.occurredOn per REQ-DLN-007 (no separate Clock call)
  const newInventory = tagInventoryApplyNoteDeleted(inventory, event.frontmatter, event.occurredOn);

  return {
    kind: "UpdatedProjection",
    feed: newFeed,
    tagInventory: newInventory,
  };
}

// ── removedTagsFromDeletion ───────────────────────────────────────────────────
// Pure helper: returns the tags from frontmatter.tags whose usageCount was
// decremented (both pruned-to-zero and decremented-without-pruning).
// Used by the orchestrator to determine whether to emit TagInventoryUpdated.
// Semantics per REQ-DLN-010 / FIND-SPEC-DLN-004:
//   removedTags enumerates tags whose usageCount was DECREMENTED, not only pruned.

export function removedTagsFromDeletion(
  inventory: TagInventory,
  frontmatter: Frontmatter,
): readonly Tag[] {
  return frontmatter.tags.filter((tag) =>
    inventory.entries.some((e) => String(e.name) === String(tag)),
  );
}
