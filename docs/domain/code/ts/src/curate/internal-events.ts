// Curate Context — Internal Application Events.
// Public Domain Event は shared/events.ts。
//
// 由来:
//   - domain-events.md §Internal Application Events / Curate 内
//   - glossary.md §2 Curate が発する Domain Event

import type { NoteId, Tag, Timestamp } from "../shared/value-objects.js";

export type CurateInternalEvent =
  | FeedRestored
  | TagInventoryBuilt
  | TagInventoryUpdated
  | PastNoteFocused
  | FeedFilterByTagApplied
  | FeedFilterByFrontmatterApplied
  | FeedFilterCleared
  | FeedSortedByTimestamp
  | FeedSearchQueryEntered
  | FeedSearchApplied
  | FeedSearchYieldedNoResults
  | FeedSearchCleared
  | FeedSearchHighlightApplied
  | TagChipAddedOnFeed
  | TagChipRemovedOnFeed
  | NoteDeletionRequestedInternal
  | NoteDeletionConfirmedInternal
  | NoteDeletionCanceled;

export type FeedRestored = {
  readonly kind: "feed-restored";
  readonly noteCount: number;
  readonly occurredOn: Timestamp;
};

export type TagInventoryBuilt = {
  readonly kind: "tag-inventory-built";
  readonly tagCount: number;
  readonly occurredOn: Timestamp;
};

export type TagInventoryUpdated = {
  readonly kind: "tag-inventory-updated";
  readonly addedTags: readonly Tag[];
  readonly removedTags: readonly Tag[];
  readonly occurredOn: Timestamp;
};

export type PastNoteFocused = {
  readonly kind: "past-note-focused";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type FeedFilterByTagApplied = {
  readonly kind: "feed-filter-by-tag-applied";
  readonly tags: readonly Tag[];
  readonly occurredOn: Timestamp;
};

export type FeedFilterByFrontmatterApplied = {
  readonly kind: "feed-filter-by-frontmatter-applied";
  readonly field: string;
  readonly value: string;
  readonly occurredOn: Timestamp;
};

export type FeedFilterCleared = {
  readonly kind: "feed-filter-cleared";
  readonly occurredOn: Timestamp;
};

export type FeedSortedByTimestamp = {
  readonly kind: "feed-sorted-by-timestamp";
  readonly direction: "desc" | "asc";
  readonly occurredOn: Timestamp;
};

export type FeedSearchQueryEntered = {
  readonly kind: "feed-search-query-entered";
  readonly text: string;
  readonly occurredOn: Timestamp;
};

export type FeedSearchApplied = {
  readonly kind: "feed-search-applied";
  readonly text: string;
  readonly hitCount: number;
  readonly occurredOn: Timestamp;
};

export type FeedSearchYieldedNoResults = {
  readonly kind: "feed-search-yielded-no-results";
  readonly text: string;
  readonly occurredOn: Timestamp;
};

export type FeedSearchCleared = {
  readonly kind: "feed-search-cleared";
  readonly occurredOn: Timestamp;
};

export type FeedSearchHighlightApplied = {
  readonly kind: "feed-search-highlight-applied";
  readonly text: string;
  readonly occurredOn: Timestamp;
};

/** Internal だが SaveNoteRequested を発行するトリガ。 */
export type TagChipAddedOnFeed = {
  readonly kind: "tag-chip-added-on-feed";
  readonly noteId: NoteId;
  readonly tag: Tag;
  readonly occurredOn: Timestamp;
};

export type TagChipRemovedOnFeed = {
  readonly kind: "tag-chip-removed-on-feed";
  readonly noteId: NoteId;
  readonly tag: Tag;
  readonly occurredOn: Timestamp;
};

export type NoteDeletionRequestedInternal = {
  readonly kind: "note-deletion-requested-internal";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type NoteDeletionConfirmedInternal = {
  readonly kind: "note-deletion-confirmed-internal";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type NoteDeletionCanceled = {
  readonly kind: "note-deletion-canceled";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};
