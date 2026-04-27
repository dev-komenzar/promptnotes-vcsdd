// Curate Context — Commands.
//
// 由来:
//   - event-storming.md Curate 側 Command
//   - aggregates.md §2 Feed 公開操作

import type { NoteId, Tag, Timestamp } from "../shared/value-objects.js";
import type { SearchQuery, SortOrder } from "./aggregates.js";

export type CurateCommand =
  | SelectPastNote
  | ApplyTagFilter
  | RemoveTagFilter
  | ApplyFrontmatterFilter
  | ClearFilter
  | ApplySearch
  | ClearSearch
  | SortBy
  | AddTagViaChip
  | RemoveTagViaChip
  | RequestNoteDeletion
  | ConfirmNoteDeletion
  | CancelNoteDeletion;

export type SelectPastNote = {
  readonly kind: "select-past-note";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type ApplyTagFilter = {
  readonly kind: "apply-tag-filter";
  readonly tag: Tag;
  readonly issuedAt: Timestamp;
};

export type RemoveTagFilter = {
  readonly kind: "remove-tag-filter";
  readonly tag: Tag;
  readonly issuedAt: Timestamp;
};

export type ApplyFrontmatterFilter = {
  readonly kind: "apply-frontmatter-filter";
  readonly field: string;
  readonly value: string;
  readonly issuedAt: Timestamp;
};

export type ClearFilter = {
  readonly kind: "clear-filter";
  readonly issuedAt: Timestamp;
};

export type ApplySearch = {
  readonly kind: "apply-search";
  readonly query: SearchQuery;
  readonly issuedAt: Timestamp;
};

export type ClearSearch = {
  readonly kind: "clear-search";
  readonly issuedAt: Timestamp;
};

export type SortBy = {
  readonly kind: "sort-by";
  readonly order: SortOrder;
  readonly issuedAt: Timestamp;
};

export type AddTagViaChip = {
  readonly kind: "add-tag-via-chip";
  readonly noteId: NoteId;
  readonly tag: Tag;
  readonly issuedAt: Timestamp;
};

export type RemoveTagViaChip = {
  readonly kind: "remove-tag-via-chip";
  readonly noteId: NoteId;
  readonly tag: Tag;
  readonly issuedAt: Timestamp;
};

export type RequestNoteDeletion = {
  readonly kind: "request-note-deletion";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type ConfirmNoteDeletion = {
  readonly kind: "confirm-note-deletion";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type CancelNoteDeletion = {
  readonly kind: "cancel-note-deletion";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};
