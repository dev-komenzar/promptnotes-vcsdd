// apply-filter-or-search/parse-filter-input.ts
//
// REQ-001..REQ-006
// Pure function. Implements ParseFilterInput from curate/workflows.ts.
//
// - Iterates tagsRaw in order, calling tryNewTag (imported from ./try-new-tag).
// - Fail-fast on first invalid tag: returns Err with verbatim raw string (REQ-003).
// - Deduplicates normalized tags by first-occurrence order (REQ-001/REQ-002).
// - searchTextRaw: null OR trim==='' → query: null. Otherwise → verbatim, no trim (REQ-005).
// - fieldsRaw passes through as-is.
// - sortOrder passes through verbatim (REQ-006).

import type { Tag } from "promptnotes-domain-types/shared/value-objects";
import type { ParseFilterInput } from "promptnotes-domain-types/curate/workflows";
import { ok, err } from "promptnotes-domain-types/util/result";
import { tryNewTag } from "./try-new-tag.js";

export const parseFilterInput: ParseFilterInput = (raw) => {
  const validatedTags: Tag[] = [];
  const seenTagValues = new Set<string>();

  for (const rawTag of raw.tagsRaw) {
    const result = tryNewTag(rawTag);
    if (!result.ok) {
      return err({ kind: "invalid-tag", raw: rawTag });
    }
    const normalized = result.value as unknown as string;
    if (!seenTagValues.has(normalized)) {
      seenTagValues.add(normalized);
      validatedTags.push(result.value);
    }
  }

  const query =
    raw.searchTextRaw === null || raw.searchTextRaw.trim() === ""
      ? null
      : { text: raw.searchTextRaw, scope: "body+frontmatter" as const };

  return ok({
    kind: "AppliedFilter",
    criteria: {
      tags: validatedTags as readonly Tag[],
      frontmatterFields: raw.fieldsRaw,
    },
    query,
    sortOrder: raw.sortOrder,
  });
};
