// apply-filter-or-search/index.ts — barrel re-export
//
// tryNewTag is intentionally NOT re-exported here. It is an implementation
// detail consumed only by parseFilterInput. Callers use parseFilterInput
// (which rewraps any tag error as { kind: "invalid-tag", raw }) per REQ-003.

export { parseFilterInput } from "./parse-filter-input.js";
export { applyFilterOrSearch } from "./apply-filter-or-search.js";
export { tryNewTag } from "./try-new-tag.js";
