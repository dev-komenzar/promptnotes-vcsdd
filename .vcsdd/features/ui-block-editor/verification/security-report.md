# Security Hardening Report

## Feature: ui-block-editor | Phase: 5 (Formal Hardening) | Date: 2026-05-09

---

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| `grep` (source-grep security scan) | Available | Used for all static analysis below |
| Semgrep | Not checked — not required for this feature surface | No secrets, no network I/O, no filesystem writes in TS layer |
| Wycheproof | Not applicable | No cryptographic operations anywhere in `src/lib/block-editor/` |

Raw grep output is captured under `verification/security-results/`.

---

## Findings

### 1. Adapter Promise rejection swallowing (REQ-BE-013 / NFR-BE-005)

**Check**: Do any `.catch(() => {})` handlers log the original error to console or re-throw in a way that could exfiltrate user input?

**Evidence**: `grep -n 'console\.|throw\s' BlockElement.svelte SaveFailureBanner.svelte` returned ZERO HITS. (`security-results/grep-error-exfiltration.txt`)

Every `adapter.dispatchXxx(...).catch(() => {})` in `BlockElement.svelte` (lines 93, 155, 168, 228, 242, 258, 276) and `SlashMenu.svelte` (line —, via `handleSlashSelect` in BlockElement at line 277) uses a bare empty arrow function. The rejection is intentionally swallowed at the IPC boundary; no error detail is written to `console`, no user content is forwarded to any logging surface.

**Result**: PASS — no error exfiltration pathway exists.

---

### 2. textContent → BlockContent VO control-char strip (NFR-BE-006)

**Check**: Does `sanitiseContent` in `BlockElement.svelte` (lines 122–143) cover U+0000–U+001F, U+007F, and all dangerous Unicode characters?

**Implementation** (BlockElement.svelte:127–139):
```
const isControl = (code >= 0x00 && code <= 0x1f) || code === 0x7f;
```

- Non-code blocks: strips the full U+0000–U+001F range (including `\n` U+000A and `\t` U+0009) plus U+007F.
- Code blocks: keeps `\n` (0x0A) and `\t` (0x09), strips the rest of U+0000–U+001F and U+007F.

**Unicode characters NOT covered by the current range**:
- **U+2028 LINE SEPARATOR** (decimal 8232): above U+001F, not stripped. In a `contenteditable` div, browsers may insert U+2028 in some paste scenarios. This character is a line terminator in JavaScript but not in JSON. It would pass through to the Rust domain layer unmodified.
- **U+202E RIGHT-TO-LEFT OVERRIDE** (decimal 8238): above U+001F, not stripped. Could be used to visually mislead the user about rendered content in a code block, though it does not affect the stored string value.
- **U+FEFF BOM** (decimal 65279): not stripped. Can appear in pasted content.

**Assessment**: The current implementation meets the `BlockContent` VO constraint defined in the behavioral spec (NFR-BE-006), which explicitly targets U+0000–U+001F and U+007F. The uncovered characters (U+2028, U+202E, U+FEFF) are not currently in scope and do not create an injection or exfiltration risk in the Tauri + Rust backend context — the Rust domain will receive them as literal Unicode codepoints in a string, which is well-defined behavior.

**Result**: PASS for declared scope. **NEEDS REVIEW** for U+2028 / U+202E / U+FEFF — recommend adding these to the strip list in a future sprint if the Rust `BlockContent` VO validates against them. Raised as a non-blocking Phase 6 carry-over.

---

### 3. DOM injection surface — `{@html ...}` check

**Check**: Does any component in `src/lib/block-editor/` use `{@html ...}` to reflect user input as raw HTML?

**Evidence**: `grep -rn '{@html' src/lib/block-editor/` returned ZERO HITS. (`security-results/grep-html-injection.txt`)

The `<div contenteditable="true">` in `BlockElement.svelte` (line 303–320) renders `block.content` as a text node via Svelte's default text interpolation (`{block.content}`), not as HTML. User-typed text cannot become HTML markup through the block rendering path.

**Result**: PASS

---

### 4. Slash-menu input echo (slashQuery → query prop)

**Check**: `slashQuery` is set to `content.slice(1)` (BlockElement.svelte:175) and passed as `query` prop to `SlashMenu`. Does SlashMenu execute or inject this value?

**Evidence** (SlashMenu.svelte:43–46):
```svelte
ALL_TYPES.filter(({ label, type }) =>
  label.toLowerCase().includes(query.toLowerCase()) ||
  type.toLowerCase().includes(query.toLowerCase())
)
```

The `query` value is consumed only via `.toLowerCase().includes(...)`. It is never rendered as HTML, never passed to `eval`, and never used in a regex constructed from user input. The filtered results are static `BlockTypeEntry` objects from the `ALL_TYPES` constant — the query cannot inject new entries.

**Result**: PASS

---

### 5. Clipboard / Tauri IPC pathway

**Check**: Does the TS layer write directly to clipboard or filesystem?

`clipboardAdapter.ts` (the `navigator.clipboard.writeText` wrapper) has zero importers in production source. Confirmed by sprint-4.gates.test.ts (EC-BE-013 / FIND-BE-3-012): `grep -rn 'clipboardAdapter'` in `src/` with import filter returned ZERO HITS.

All `dispatchXxx` calls in `BlockElement.svelte` go through the injected `BlockEditorAdapter` interface, which in production is backed by `invoke()` calls to the Rust backend. The TS layer performs no direct file writes, no direct clipboard access, and no direct storage access.

**Result**: PASS

---

### 6. External link / URL handling

**Check**: Are there any URL constructions, `window.open`, or external navigation in block-editor components?

**Evidence**: `grep -rn 'http|url|href|location|window\.open'` on all `.svelte` and `.ts` files in `src/lib/block-editor/` returned ZERO HITS.

**Result**: PASS — no external URL handling present.

---

### 7. Drag-and-drop dataTransfer

**Check**: `BlockDragHandle.svelte:42–44` calls `event.dataTransfer.setData('text/plain', block.id)`. Is the `block.id` value safe?

`block.id` originates from the Rust backend as a UUID-style identifier (no user-supplied content). It is set as `'text/plain'` data, which is the lowest-risk MIME type for drag payloads (no HTML execution path). No external data flows into this value from user input.

**Result**: PASS

---

## Summary

| Check | Finding | Result |
|-------|---------|--------|
| Promise rejection swallowing (NFR-BE-005) | No `console.*` or `throw` in any `.catch()` handler | PASS |
| Control-char strip U+0000–U+001F + U+007F (NFR-BE-006) | Implemented correctly for declared scope | PASS |
| Control-char strip — U+2028 / U+202E / U+FEFF | Not stripped; outside current spec scope | NEEDS REVIEW (non-blocking carry-over) |
| DOM injection via `{@html ...}` | Zero `@html` directives in block-editor | PASS |
| SlashMenu query echo / injection | `.includes()` filter only; no execution surface | PASS |
| Clipboard / Tauri IPC pathway | clipboardAdapter has zero importers; no direct FS/clipboard writes | PASS |
| External link / URL handling | No URL constructions or external navigation | PASS |
| dataTransfer payload | `block.id` is backend UUID; `text/plain` MIME type | PASS |
| Cryptographic operations (Wycheproof) | Not applicable — no crypto in this feature | N/A |

**Overall security verdict**: No critical or major security findings. One non-blocking carry-over item (U+2028 / U+202E / U+FEFF handling) is recommended for a future sprint. Phase 6 is not blocked.
