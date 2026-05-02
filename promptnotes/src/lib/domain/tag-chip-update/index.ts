// tag-chip-update/index.ts
// Public surface re-exports for the tag-chip-update workflow.

export { tagChipUpdate } from "./pipeline.js";
export { loadCurrentNote } from "./load-current-note.js";
export { applyTagOperationPure, tagsEqualAsSet } from "./apply-tag-operation-pure.js";
export { applyTagOperation } from "./apply-tag-operation.js";
export { buildTagChipSaveRequest } from "./build-save-request.js";
export { updateProjectionsAfterSave } from "./update-projections.js";
export type {
  SaveErrorDelta,
  SaveValidationErrorDelta,
  TagChipUpdateDeps,
  TagChipUpdate,
  WriteMarkdown,
  GetAllSnapshots,
  EventBusPublishInternal,
  BuildTagChipSaveRequest,
} from "./_deltas.js";
