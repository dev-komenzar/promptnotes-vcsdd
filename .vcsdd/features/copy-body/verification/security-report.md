# Security Hardening Report: copy-body

**Feature**: copy-body
**Phase**: 5 (lean — visual inspection only)
**Date**: 2026-05-01

## Scope

CopyBody pipeline writes a string to the OS clipboard. Threat surface is small:

1. Information disclosure: copying frontmatter to clipboard would leak metadata.
2. Untrusted input: the body is user-authored — copying it back to the OS clipboard is an explicit user action, no escaping needed.
3. Side channel via event: `NoteBodyCopiedToClipboard` is internal to Capture; no public-event exposure.

## Tooling

- Visual inspection (lean mode default).
- TypeScript strict-mode compiler (`svelte-check`) — types verified.
- bun test — 320/320 baseline + 45/45 copy-body tests pass.

No automated SAST / DAST / secret-scanning was run for this feature (lean mode policy).

## Findings (visual inspection)

| Finding | Severity | Status |
|---------|---------:|-------:|
| Frontmatter exclusion | n/a (REQ-002 / PROP-003) | Verified by sentinel property test |
| Clipboard error reveals fs path? | low | `FsError.path` may carry a path; in this app the clipboard port does not pass paths through (clipboard is path-less). The `path?` optional field is unused on this code path. |
| Logging body content | n/a | Pipeline does not log; only emits an event with `noteId` and `occurredOn`, not body content. |

## OWASP Quick Pass

- **Injection**: not applicable (no string interpolation into queries / templates).
- **Broken Access Control**: not applicable (no authorization step).
- **Cryptographic Failures**: not applicable (no crypto in this pipeline).
- **Insecure Design**: pipeline is Pure-leaning, Result-typed, no exceptions; design is appropriate.
- **Logging / Monitoring**: internal event carries `noteId` only — appropriate.

## Summary

No security findings. Lean mode visual-inspection complete. Log: `verification/security-results/owasp-visual-inspection.log`.
