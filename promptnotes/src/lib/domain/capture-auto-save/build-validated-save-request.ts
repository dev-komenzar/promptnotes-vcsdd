// capture-auto-save/build-validated-save-request.ts
// Factory for ValidatedSaveRequest (REQ-018).
//
// Direct object-literal construction of ValidatedSaveRequest is forbidden by
// code-review convention (REQ-018 / FIND-013 resolution). All construction MUST
// go through this factory, which atomically derives:
//   body = serializeBlocksToMarkdown(blocks)
//
// This guarantees the body/blocks coherence invariant (PROP-024).

import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import type { Block } from "promptnotes-domain-types/shared/note";
import type {
  Body,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import { serializeBlocksToMarkdown } from "./serialize-blocks-to-markdown.js";

/**
 * Construct a ValidatedSaveRequest from its constituent parts.
 * Derives `body = serializeBlocksToMarkdown(blocks)` atomically.
 *
 * REQ-018: The only approved construction site for ValidatedSaveRequest.
 * Consumers pass blocks; body is never independently specified.
 */
export function buildValidatedSaveRequest(
  noteId: NoteId,
  blocks: ReadonlyArray<Block>,
  frontmatter: Frontmatter,
  previousFrontmatter: Frontmatter | null,
  trigger: "idle" | "blur",
  requestedAt: Timestamp,
): ValidatedSaveRequest {
  const body = serializeBlocksToMarkdown(blocks) as unknown as Body;

  return {
    kind: "ValidatedSaveRequest",
    noteId,
    blocks,
    body,
    frontmatter,
    previousFrontmatter,
    trigger,
    requestedAt,
  } as ValidatedSaveRequest;
}
