// edit-past-note-start/start-new-session.ts
// Step 3: Construct the new editing session.
//
// REQ-EPNS-008: NewSession with focusedBlockId; cross-note hydration via parseMarkdownToBlocks;
//               same-note reuses existing note from decision payload (no hydration).
// REQ-EPNS-010: Emit BlockFocused (replaces EditorFocusedOnPastNote).
// REQ-EPNS-012: Clock.now() called exactly once per invocation.
// PC-002: parseMarkdownToBlocks failure → throw (programming error, not recoverable Err).
//
// FIND-EPNS-S2-P3-004: clockNow() is called AFTER parseMarkdownToBlocks (resolveNote).
//   On PC-002 parse failure, clockNow is NOT invoked — spec says "no port is invoked"
//   on precondition violation. Reorder enforces this invariant.

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { Result } from "promptnotes-domain-types/util/result";
import type {
  BlockFocusRequest,
  CurrentSessionDecision,
  NewSession,
} from "promptnotes-domain-types/capture/stages";

/** Structural type for parse errors — avoids importing the unexported shared/blocks module. */
type BlockParseError = { kind: string; [k: string]: unknown };

export type StartNewSessionPorts = {
  readonly clockNow: () => Timestamp;
  readonly parseMarkdownToBlocks: (markdown: string) => Result<ReadonlyArray<Block>, BlockParseError>;
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

/**
 * Construct a new editing session and emit BlockFocused.
 *
 * Same-note path: reuses the note from the 'same-note' decision payload; no hydration.
 * Cross-note path: hydrates request.snapshot via parseMarkdownToBlocks (PC-002 enforced).
 *
 * IMPORTANT (FIND-EPNS-S2-P3-004): clockNow() is called AFTER resolveNote().
 * If parseMarkdownToBlocks fails (PC-002), we throw before ever calling clockNow.
 * This satisfies the spec claim "no port is invoked on precondition violation".
 */
export function startNewSession(
  request: BlockFocusRequest,
  decision: CurrentSessionDecision,
  ports: StartNewSessionPorts,
): NewSession {
  // Resolve note FIRST (may throw on PC-002 parse failure)
  // clockNow is called AFTER resolveNote so it's never invoked on parse failure.
  const note = resolveNote(request, decision, ports);

  // REQ-EPNS-012: exactly one Clock.now() call per invocation (after parse, before emit)
  const startedAt = ports.clockNow();

  const newSession: NewSession = {
    kind: "NewSession",
    noteId: request.noteId,
    note,
    focusedBlockId: request.blockId,
    startedAt,
  };

  // REQ-EPNS-010: emit BlockFocused (Capture-internal; replaces EditorFocusedOnPastNote)
  ports.emit({
    kind: "block-focused",
    noteId: request.noteId,
    blockId: request.blockId,
    occurredOn: startedAt,
  });

  return newSession;
}

/**
 * Resolve the Note for the new session.
 *
 * same-note: return decision.note directly (no I/O, no hydration).
 * cross-note: parse snapshot.body via parseMarkdownToBlocks.
 *   PC-001 guarantees snapshot is non-null for cross-note (enforced at pipeline entry).
 *   PC-002: parse failure → throw (programming error).
 */
function resolveNote(
  request: BlockFocusRequest,
  decision: CurrentSessionDecision,
  ports: StartNewSessionPorts,
): Note {
  if (decision.kind === "same-note") {
    // Same-note path: reuse the existing note from the decision payload (no hydration)
    return decision.note;
  }

  // Cross-note path: PC-001 guarantees snapshot is non-null here
  // (pipeline checks this before calling startNewSession)
  const snapshot = request.snapshot!;

  const parseResult = ports.parseMarkdownToBlocks(snapshot.body as unknown as string);

  if (!parseResult.ok) {
    // PC-002: parse failure is a programming error; throw, do NOT return Err silently
    throw new Error(
      `startNewSession: parseMarkdownToBlocks failed — ${JSON.stringify(parseResult.error)}`
    );
  }

  const note: Note = {
    id: request.noteId,
    blocks: parseResult.value,
    frontmatter: snapshot.frontmatter,
  } as unknown as Note;

  return note;
}
