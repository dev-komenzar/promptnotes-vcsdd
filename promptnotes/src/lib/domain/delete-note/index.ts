// delete-note/index.ts
// Public surface re-exports for the delete-note workflow.

export { deleteNote } from "./pipeline.js";
export { authorizeDeletionPure } from "./authorize-deletion-pure.js";
export { authorizeDeletion } from "./authorize-deletion.js";
export { buildDeleteNoteRequested } from "./build-delete-request.js";
export { updateProjectionsAfterDelete, removedTagsFromDeletion } from "./update-projections.js";
export { normalizeFsError } from "./normalize-fs-error.js";
export type {
  DeleteNote,
  DeleteNoteDeps,
  TrashFile,
  GetAllSnapshots,
  EventBusPublishInternal,
  BuildDeleteNoteRequested,
  UpdateProjectionsAfterDelete,
  AuthorizeDeletionPure,
  AuthorizationErrorDelta,
  DeletionErrorDelta,
} from "./_deltas.js";
