# Security Report

## Feature: copy-body | Sprint: 3 | Date: 2026-05-07

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| semgrep | NOT INSTALLED | Manual static analysis performed as fallback |
| Wycheproof | NOT APPLICABLE | No cryptographic operations in copy-body |
| bun grep scan | Available | Used for pattern matching against source files |

Raw scan evidence: `.vcsdd/features/copy-body/verification/sprint-3/` (this file serves as the consolidated report; no separate raw-result directory needed for manual grep scans — see scan commands below).

## Scan Commands and Results

### eval / new Function / dynamic require
```
grep -rn "eval\|new Function\|require(" \
  promptnotes/src/lib/domain/copy-body/
```
Result: no matches — zero occurrences in body-for-clipboard.ts or pipeline.ts.

### console.log / console.error
```
grep -rn "console\.log\|console\.error" \
  promptnotes/src/lib/domain/copy-body/
```
Result: no matches — no logging statements left in either implementation file.

### Date.now / Math.random / async
```
grep -rn "Date\.now\|Math\.random\|async\|await" \
  promptnotes/src/lib/domain/copy-body/body-for-clipboard.ts \
  promptnotes/src/lib/domain/copy-body/pipeline.ts
```
Result: no matches in body-for-clipboard.ts (pure function, no I/O). pipeline.ts correctly delegates clockNow to the injected port rather than calling Date.now() directly.

### Template-literal injection
No user-controlled input is interpolated into template literals. The only string produced is `serializeBlocksToMarkdown(note.blocks)` — a deterministic serializer call with no dynamic string construction in copy-body itself.

### Serializer import path
`body-for-clipboard.ts` imports via the canonical static path:
```
import { serializeBlocksToMarkdown } from "../capture-auto-save/serialize-blocks-to-markdown.js";
```
No dynamic `require()`, no `import()` with computed strings. The cross-feature import is documented as a non-blocking finding in verification-architecture.md (to be resolved in a "shared kernel utility" feature).

### Frontmatter access
PROP-003(b) Proxy test (passing) provides direct evidence that `bodyForClipboard` does not access `note.frontmatter` at runtime. This eliminates any risk of accidentally leaking frontmatter content to the clipboard.

## Summary

Clean pass. No `eval`, no `new Function`, no dynamic require, no console logging, no direct Date.now/Math.random calls, no template-literal injection vectors. The serializer is called via a static canonical import only. Wycheproof is not applicable (no cryptography). Semgrep was not installed; manual grep scan covered the equivalent patterns.
