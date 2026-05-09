# Security Hardening Report — edit-past-note-start

**Feature**: edit-past-note-start
**Phase**: 5 (Sprint 2)
**Date**: 2026-05-07
**Mode**: lean (lightweight security audit)

---

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| semgrep | NOT INSTALLED | Lean-mode: manual static scan substituted |
| Wycheproof | NOT APPLICABLE | No cryptographic operations in this feature |
| bun test (static pattern grep) | Available | Used for inline injection/cast checks |
| Manual OWASP inspection | Completed | All 5 impl files reviewed |

Raw scan output: `verification/security-results/sprint2-static-scan.log`

---

## Findings

### 1. Unsafe casts (`as any`)

Result: NONE detected across all 5 implementation files.

No `as any` casts are present. The implementation uses TypeScript's type system without bypassing it through `any`.

### 2. Double casts (`as unknown as`)

Three occurrences detected — all are deliberate boundary-bridging at domain-type interop points:

- `is-empty-note.ts:29` — `block.content as unknown as string`: Block content is a branded/opaque type in `promptnotes-domain-types`; the cast is read-only (string operations only, no mutation or serialization).
- `start-new-session.ts:95` — `snapshot.body as unknown as string`: `snapshot.body` is a `Body` branded value; the cast is required to pass it to `parseMarkdownToBlocks` which accepts `string`. No SQL, HTML, or shell context.
- `start-new-session.ts:108` — `{ id, blocks, frontmatter } as unknown as Note`: Constructing a `Note` from constituent parts that satisfy the shape but lack the nominal brand. Common pattern in domain constructors within this codebase.

Security assessment: These are type-bridging patterns, not security vulnerabilities. None of the cast values are used in HTML rendering, SQL queries, shell commands, or external serialization contexts. The workflow is a pure domain computation layer.

### 3. Injection patterns (eval / exec / innerHTML / dangerouslySetInnerHTML)

Result: NONE detected.

### 4. Raw string as HTML

Result: NONE detected. No DOM manipulation in any impl file.

### 5. Direct I/O access (process / fs / require)

Result: NONE detected. All I/O is delegated to injected ports (`clockNow`, `blurSave`, `emit`, `parseMarkdownToBlocks`).

### 6. Direct Date.now() calls (Clock port bypass)

Result: NONE detected. Sprint 1 FIND-001 (direct `Date.now()` usage) was resolved in Sprint 1; Sprint 2 confirms zero occurrences across all 5 files.

### 7. Error message content (sensitive info leak)

Seven `throw new Error(...)` statements reviewed:

- `classify-current-session.ts:37` — "classifyCurrentSession: currentNote must not be null when status is 'editing'"
- `classify-current-session.ts:54` — "classifyCurrentSession: currentNote must not be null when status is 'save-failed'"
- `classify-current-session.ts:71` — "classifyCurrentSession called with invalid state: ${state.status}. Caller must guard..."
- `pipeline.ts:102` — "EditPastNoteStart: currentNote must be null when state.status is 'idle'"
- `pipeline.ts:112` — "EditPastNoteStart: currentNote must not be null when state.status is 'editing' or 'save-failed'"
- `pipeline.ts:126` — "EditPastNoteStart: cross-note request requires non-null snapshot"
- `start-new-session.ts:99` — "startNewSession: parseMarkdownToBlocks failed — ${JSON.stringify(parseResult.error)}"

Assessment: All messages contain only structural state information (status strings, function names). `parseResult.error` is a `BlockParseError` domain struct with a `kind: string` discriminant — no file paths, no user content, no credentials. `FsError` file paths are NOT included in any thrown message (they appear in `SaveError` which is returned through the port result type, not logged here). No sensitive data leakage.

### 8. Precondition throw ordering relative to side effects

Verified via source inspection of `pipeline.ts`:

```
Line 101-105: PC-004 idle+non-null throw (BEFORE any port call)
Line 107-115: PC-004 editing/save-failed+null throw (BEFORE any port call)
Line 119:     classifyCurrentSession() — pure, no side effects
Line 125-129: PC-001 cross-note+null-snapshot throw (BEFORE flush/start)
Line 132-141: flushCurrentSession() — first effectful call
Line 149-153: startNewSession() — second effectful call
```

All throws occur before the first port invocation. This matches FIND-001/004 resolution requirements and PROP-EPNS-027 verification.

---

## Summary

**Security verdict: PASS**

- Critical findings: 0
- Medium findings: 0
- Low findings: 0
- Informational (cast patterns): 3 (reviewed, benign)

This feature is a pure domain workflow layer. All external I/O is delegated through typed port interfaces. No cryptographic operations are present (Wycheproof not applicable). No injection attack surface exists (no HTML rendering, SQL, or shell execution). Branded value types prevent raw string injection. The `SwitchError` `never` branch enforces exhaustive error handling at compile time. Precondition guards throw before any side effect, satisfying PROP-EPNS-027 sub-cases (c), (d), and (e).
