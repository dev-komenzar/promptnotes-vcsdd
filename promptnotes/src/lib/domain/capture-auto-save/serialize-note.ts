// capture-auto-save/serialize-note.ts
// Step 2: serializeNote — pure function that produces Obsidian-compatible markdown.
//
// REQ-006: Produces `---\n{yaml}\n---\n{body}` format
// No CaptureDeps port calls — this is a pure function.

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
function frontmatterToYaml(fm: any): string {
  const lines: string[] = [];

  // tags
  if (fm.tags && fm.tags.length > 0) {
    lines.push("tags:");
    for (const tag of fm.tags) {
      lines.push(`  - ${tag}`);
    }
  } else {
    lines.push("tags: []");
  }

  // createdAt
  lines.push(`createdAt: ${formatTimestamp(fm.createdAt)}`);

  // updatedAt
  lines.push(`updatedAt: ${formatTimestamp(fm.updatedAt)}`);

  return lines.join("\n") + "\n";
}

function formatTimestamp(ts: any): string {
  if (ts && typeof ts.epochMillis === "number") {
    return new Date(ts.epochMillis).toISOString();
  }
  return String(ts);
}
