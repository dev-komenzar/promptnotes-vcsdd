// tag-chip-update/update-projections.ts
// Step 4: Update Feed and TagInventory projections after a successful save.
//
// REQ-TCU-010: FeedOps.refreshSort + TagInventoryOps.applyNoteFrontmatterEdited called.
//              TagInventoryUpdated emitted via publishInternal.
// PROP-TCU-006: Only called on the success path; never reached on fs-error.
// PROP-TCU-016: Pure relative to the immutable inputs; side effects confined to deps.
// PROP-TCU-021: TagInventoryUpdated.occurredOn === NoteFileSaved.occurredOn.

import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { Tag, Timestamp, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { IndexedNote } from "promptnotes-domain-types/curate/stages";
import type { CurateInternalEvent, TagInventoryUpdated } from "promptnotes-domain-types/curate/internal-events";
import type { TagChipUpdateDeps } from "./_deltas.js";

// ── tagDiff ───────────────────────────────────────────────────────────────
// Single source of truth for the before→after tag set difference.
// Used by both inventory update and event payload construction.

type TagDiff = { readonly added: readonly Tag[]; readonly removed: readonly Tag[] };

function tagDiff(before: Frontmatter, after: Frontmatter): TagDiff {
  const beforeSet = new Set(before.tags.map(String));
  const afterSet = new Set(after.tags.map(String));
  return {
    added: after.tags.filter((t) => !beforeSet.has(String(t))),
    removed: before.tags.filter((t) => !afterSet.has(String(t))),
  };
}

// ── FeedOps inline implementation (refreshSort) ───────────────────────────
// The canonical FeedOps interface has no implementation in this phase.
// refreshSort re-sorts noteRefs by fileMtime descending using available snapshots.

function refreshSort(feed: Feed, snapshots: readonly NoteFileSnapshot[]): Feed {
  const snapshotMap = new Map<string, NoteFileSnapshot>();
  for (const snap of snapshots) {
    snapshotMap.set(String(snap.noteId), snap);
  }

  const sorted = [...feed.noteRefs].sort((a, b) => {
    const snapA = snapshotMap.get(String(a));
    const snapB = snapshotMap.get(String(b));
    const msA = snapA ? (snapA.fileMtime as unknown as { epochMillis: number }).epochMillis : 0;
    const msB = snapB ? (snapB.fileMtime as unknown as { epochMillis: number }).epochMillis : 0;
    return msB - msA;
  });

  return { ...feed, noteRefs: sorted };
}

// ── TagInventoryOps inline implementation ─────────────────────────────────
// applyNoteFrontmatterEdited: apply a TagDiff to inventory entries.

function applyNoteFrontmatterEdited(
  inventory: TagInventory,
  diff: TagDiff,
  now: Timestamp,
): TagInventory {
  let entries = [...inventory.entries];

  // Increment counts for added tags; insert new entries as needed.
  for (const tag of diff.added) {
    const idx = entries.findIndex((e) => String(e.name) === String(tag));
    if (idx >= 0) {
      entries[idx] = { name: entries[idx].name, usageCount: entries[idx].usageCount + 1 };
    } else {
      entries = [...entries, { name: tag, usageCount: 1 }];
    }
  }

  // Decrement counts for removed tags; drop entries that reach zero.
  for (const tag of diff.removed) {
    const idx = entries.findIndex((e) => String(e.name) === String(tag));
    if (idx >= 0) {
      const newCount = entries[idx].usageCount - 1;
      if (newCount > 0) {
        entries[idx] = { name: entries[idx].name, usageCount: newCount };
      } else {
        entries = entries.filter((_, i) => i !== idx);
      }
    }
  }

  return { entries, lastBuiltAt: now };
}

// ── updateProjectionsAfterSave ────────────────────────────────────────────

export function updateProjectionsAfterSave(
  deps: TagChipUpdateDeps,
): (feed: Feed, inventory: TagInventory, event: NoteFileSaved) => IndexedNote {
  return (feed: Feed, inventory: TagInventory, event: NoteFileSaved): IndexedNote => {
    const snapshots = deps.getAllSnapshots();

    // Update Feed: re-sort by fileMtime.
    const updatedFeed = refreshSort(feed, snapshots);

    // NoteFileSaved.previousFrontmatter is Frontmatter | null per canonical type.
    // For tag-chip-update it is always non-null (guaranteed by buildTagChipSaveRequest,
    // per spec REQ-TCU-009). If this invariant ever breaks, we must throw rather than
    // silently fall back (which would compute tagDiff(after, after) = empty delta).
    if (event.previousFrontmatter === null) {
      throw new Error(
        "invariant violated: tag-chip-update NoteFileSaved.previousFrontmatter must be non-null per spec REQ-TCU-009",
      );
    }
    const previousFm: Frontmatter = event.previousFrontmatter;
    const diff = tagDiff(previousFm, event.frontmatter);

    // Update TagInventory using the same diff used for the event payload.
    const updatedInventory = applyNoteFrontmatterEdited(inventory, diff, event.occurredOn);

    // Emit TagInventoryUpdated with occurredOn threaded from NoteFileSaved (PROP-TCU-021).
    const tagInventoryUpdated: TagInventoryUpdated = {
      kind: "tag-inventory-updated",
      addedTags: diff.added,
      removedTags: diff.removed,
      occurredOn: event.occurredOn,
    };
    deps.publishInternal(tagInventoryUpdated as CurateInternalEvent);

    return {
      kind: "IndexedNote",
      noteId: event.noteId,
      feed: updatedFeed,
      tagInventory: updatedInventory,
    };
  };
}
