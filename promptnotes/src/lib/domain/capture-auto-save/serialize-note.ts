// capture-auto-save/serialize-note.ts
// Step 2: serializeNote — pure function that produces Obsidian-compatible markdown.
//
// REQ-006: Produces `---\n{yaml}\n---\n{body}` format
// No CaptureDeps port calls — this is a pure function.

import type { Frontmatter, Timestamp, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

/**
 * Serialize a ValidatedSaveRequest into Obsidian-compatible markdown.
 * Pure function — no I/O, no ports, deterministic.
 */
export function serializeNote(request: ValidatedSaveRequest): string {
  const yaml = frontmatterToYaml(request.frontmatter);
  return `---\n${yaml}---\n${request.body}`;
}

/** Internal pure helper — NOT an injected port. */
function frontmatterToYaml(fm: Frontmatter): string {
  const lines: string[] = [];
  const tags = (fm as { tags: readonly Tag[] }).tags;
  const createdAt = (fm as { createdAt: Timestamp }).createdAt;
  const updatedAt = (fm as { updatedAt: Timestamp }).updatedAt;

  if (tags && tags.length > 0) {
    lines.push("tags:");
    for (const tag of tags) {
      lines.push(`  - ${tag}`);
    }
  } else {
    lines.push("tags: []");
  }

  lines.push(`createdAt: ${formatTimestamp(createdAt)}`);
  lines.push(`updatedAt: ${formatTimestamp(updatedAt)}`);

  return lines.join("\n") + "\n";
}

function formatTimestamp(ts: Timestamp): string {
  const epochMillis = (ts as { epochMillis: number }).epochMillis;
  if (typeof epochMillis === "number") {
    return new Date(epochMillis).toISOString();
  }
  return String(ts);
}
