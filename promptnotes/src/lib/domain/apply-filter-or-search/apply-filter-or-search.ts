// apply-filter-or-search/apply-filter-or-search.ts
//
// REQ-007..REQ-014
// Pure function. Implements ApplyFilterOrSearch from curate/workflows.ts.
//
// Steps:
//   1. Build Map<string, NoteFileSnapshot> keyed by snapshot.noteId.
//   2. Resolve candidate set: only ids in feed.noteRefs AND present in the map (REQ-007).
//   3. Filter by criteria.tags (OR within set; empty = no-op — REQ-008).
//   4. Filter by criteria.frontmatterFields (case-sensitive exact match, AND across entries; empty = no-op — REQ-010).
//   5. Filter by search query if non-null: case-insensitive substring in body + tag names (REQ-011, DD-2).
//   6. Sort by frontmatter.updatedAt per sortOrder.direction; tiebreak by noteId same direction (DD-1, REQ-012).
//   7. Return VisibleNoteIds.

import type { Tag } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { Feed, SearchQuery } from "promptnotes-domain-types/curate/aggregates";
import type { AppliedFilter, VisibleNoteIds } from "promptnotes-domain-types/curate/stages";
import type { ApplyFilterOrSearch } from "promptnotes-domain-types/curate/workflows";

export const applyFilterOrSearch: ApplyFilterOrSearch = (
  feed: Feed,
  applied: AppliedFilter,
  snapshots: readonly NoteFileSnapshot[],
): VisibleNoteIds => {
  // Step 1: Build lookup map
  const snapshotMap = new Map<string, NoteFileSnapshot>();
  for (const snap of snapshots) {
    snapshotMap.set(snap.noteId as unknown as string, snap);
  }

  // Step 2: Resolve candidate set — intersection of feed.noteRefs and snapshots
  const candidates: NoteFileSnapshot[] = [];
  for (const noteId of feed.noteRefs) {
    const snap = snapshotMap.get(noteId as unknown as string);
    if (snap !== undefined) {
      candidates.push(snap);
    }
  }

  // Steps 3-5: Apply each filter predicate in sequence (AND composition)
  const filtered = candidates
    .filter((snap) => matchesTagFilter(snap, applied.criteria.tags))
    .filter((snap) => matchesFieldFilter(snap, applied.criteria.frontmatterFields))
    .filter((snap) => matchesSearchQuery(snap, applied.query));

  // Step 6: Sort by updatedAt, tiebreak by noteId — both in same direction (DD-1)
  const sorted = [...filtered].sort(byUpdatedAtThenNoteId(applied.sortOrder.direction));

  const ids = sorted.map((s) => s.noteId);

  return {
    kind: "VisibleNoteIds",
    ids,
    hasZeroResults: ids.length === 0,
  };
};

// ── Private predicates ─────────────────────────────────────────────────────────

/** Tag filter: OR semantics — snapshot must have at least one of the criteria tags.
 *  Empty criteria.tags is a no-op (universal pass). */
function matchesTagFilter(snap: NoteFileSnapshot, tags: readonly Tag[]): boolean {
  if (tags.length === 0) return true;
  const tagSet = new Set(tags as unknown as readonly string[]);
  const snapTags = snap.frontmatter.tags as unknown as readonly string[];
  return snapTags.some((t) => tagSet.has(t));
}

/** Frontmatter field filter: AND semantics — all entries must match (case-sensitive exact).
 *  Empty fields map is a no-op (universal pass). */
function matchesFieldFilter(snap: NoteFileSnapshot, fields: ReadonlyMap<string, string>): boolean {
  if (fields.size === 0) return true;
  const fm = snap.frontmatter as unknown as Record<string, unknown>;
  for (const [key, value] of fields) {
    if (fm[key] !== value) return false;
  }
  return true;
}

/** Search filter: case-insensitive substring in body + tag names (DD-2 scope).
 *  Null query is a no-op (universal pass). */
function matchesSearchQuery(snap: NoteFileSnapshot, query: SearchQuery | null): boolean {
  if (query === null) return true;
  const needle = query.text.toLowerCase();
  const body = snap.body as unknown as string;
  const tagNames = (snap.frontmatter.tags as unknown as readonly string[]).join(" ");
  return (body + " " + tagNames).toLowerCase().includes(needle);
}

/** Comparator: primary key updatedAt, secondary key noteId — both in the same direction (DD-1). */
function byUpdatedAtThenNoteId(
  direction: "desc" | "asc",
): (a: NoteFileSnapshot, b: NoteFileSnapshot) => number {
  const sign = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const epochA = (a.frontmatter as unknown as { updatedAt: { epochMillis: number } }).updatedAt.epochMillis;
    const epochB = (b.frontmatter as unknown as { updatedAt: { epochMillis: number } }).updatedAt.epochMillis;
    if (epochA !== epochB) return sign * (epochA - epochB);
    const nidA = a.noteId as unknown as string;
    const nidB = b.noteId as unknown as string;
    if (nidA < nidB) return sign * -1;
    if (nidA > nidB) return sign * 1;
    return 0;
  };
}
