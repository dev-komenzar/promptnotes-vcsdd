# Security Hardening Report: capture-auto-save

**Feature**: capture-auto-save
**Phase**: 5 (Sprint 2)
**Date**: 2026-05-07

## Tooling

- semgrep: NOT INSTALLED (manual grep-based static analysis performed as degraded fallback)
- Wycheproof: not applicable (no cryptographic operations in this feature)
- fast-check: property test harnesses cover input shape constraints (PROP-001..028)
- Raw scan output: verification/security-results/sprint-2-scan-2026-05-07.txt

## Findings

### PATH-001 (Advisory): NoteId path-safety relies on Rust Smart Constructor

**Location**: pipeline.ts line 124
```
const filePath = `${infra.vaultPath}/${validatedRequest.noteId}.md`;
```
**Analysis**: The NoteId format is `YYYY-MM-DD-HHmmss-SSS[-N]` (digits and hyphens only),
enforced by the Rust Smart Constructor (`value_objects.rs is_valid_note_id`). This
structurally prevents path traversal (`../`, `/`, `.`) in the noteId segment.
The TypeScript layer treats `NoteId` as an opaque branded type received from Rust.
No additional TS-side validation is present.

**Risk**: ACCEPTED. The Rust layer enforces the invariant at construction time.

### YAML-001 (Low): Tag Smart Constructor not yet implemented

**Location**: serialize-note.ts `frontmatterToYaml()` + docs/domain/code/rust/src/value_objects.rs L99
**Analysis**: The `Tag::try_new` Rust Smart Constructor is `todo!("Phase 11+ 実装")`.
If a `Tag` value were to contain a literal newline character, the YAML front matter
produced by `frontmatterToYaml` would be structurally broken (newline would break the
`  - <tag>` YAML list item format, potentially injecting false document separators).

In the current MVP:
- Tags are sourced from Rust serde deserialization of existing YAML files
- The TypeScript test arbitraries use `/^[a-z][a-z0-9-]{0,19}$/` (no newlines)
- The UI does not currently offer free-text tag entry

**Risk**: LOW. Not currently exploitable via normal UI flow. Tag Smart Constructor is a
Phase 11+ work item. No remediation required before Phase 6.

### CONTENT-001 (Medium, Data Integrity Only): Paragraph content "---" causes roundtrip type change

**Location**: serialize-blocks-to-markdown.ts `serializeBlock()` paragraph case
**Analysis**: A paragraph block with content exactly `"---"` serializes to the string `"---"`.
`parseMarkdownToBlocks("---")` returns `[{type: "divider"}]`, losing the original paragraph type.
This is a YAML-front-matter-adjacent concern (the `---` separator used in Obsidian format),
not a security exploit.

**Impact**: Data integrity — user's paragraph text is silently converted to a divider on
re-parse. No unauthorized access or privilege escalation.

**Tracked as**: advisory FIND-021 (open, from Phase 3 adversarial review). The PROP-026
property test generator correctly excludes this case (documented limitation).

**Risk**: MEDIUM for data integrity. No security risk.

### Cryptographic checks

Not applicable. capture-auto-save performs no cryptographic operations. File writes use
atomic rename (temp file + rename via `writeFileAtomic`).

## Summary

- Tools attempted: semgrep (not installed — degraded to manual analysis), Wycheproof (not applicable), fast-check (used in PROP harnesses)
- Raw results: verification/security-results/sprint-2-scan-2026-05-07.txt
- Critical / High findings: 0
- Medium findings: 1 (CONTENT-001 — data integrity only, no security exploit, tracked as FIND-021)
- Low findings: 1 (YAML-001 — Tag Smart Constructor deferred, not currently exploitable)
- Advisory: 1 (PATH-001 — NoteId path safety relies on Rust layer; accepted)

No findings require remediation before Phase 6.
