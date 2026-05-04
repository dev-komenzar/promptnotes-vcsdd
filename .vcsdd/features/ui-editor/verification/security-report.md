# Security Report — ui-editor (Phase 5)

## Feature: ui-editor | Date: 2026-05-04

## Tooling

| Tool | Availability | Version / Notes |
|---|---|---|
| `grep` (XSS pattern audit) | Available | GNU grep, POSIX regex |
| `semgrep` | NOT installed | Not required for this audit tier |
| Wycheproof | Not applicable | No cryptographic operations in ui-editor |

Raw audit evidence: `.vcsdd/features/ui-editor/verification/security-results/audit-run-2026-05-04.txt`

---

## Audit 1: XSS / Code-injection Surface

### Command
```bash
grep -nrE 'eval\(|Function\(|dangerouslySetInnerHTML|\{@html|outerHTML|insertAdjacentHTML' \
  promptnotes/src/lib/editor/ --include='*.ts' --include='*.svelte'
```

### Result: ZERO HITS

No production source file in `src/lib/editor/` contains `eval(`, `Function(`, `dangerouslySetInnerHTML`, `{@html`, `outerHTML`, or `insertAdjacentHTML`.

Svelte text bindings (`{body}`, `bind:value`) are used exclusively. Svelte escapes all text interpolations by default, preventing reflected XSS. The `{@html}` directive is explicitly absent.

### innerHTML note

`innerHTML` appears only in test cleanup code (`document.body.innerHTML = ''` in 14 DOM test files as afterEach teardown). Zero occurrences in production `*.ts` or `*.svelte` files. This pattern is safe test infrastructure, not a security concern.

---

## Audit 2: Tauri IPC Surface

### Command
```bash
grep -nE 'invoke\(' promptnotes/src/lib/editor/*.ts
```

### invoke() containment: PASS

All 8 `invoke()` calls reside exclusively in `tauriEditorAdapter.ts`. `editorStateChannel.ts` contains zero `invoke()` calls (confirmed by grep). No other module in `src/lib/editor/` calls `invoke()`.

### The 8 invoke() command names and payload shapes

| Method | Tauri command name | Payload shape |
|---|---|---|
| `dispatchEditNoteBody` | `edit_note_body` | `{ noteId: string; body: string; issuedAt: string; dirty: true }` |
| `dispatchTriggerIdleSave` | `trigger_idle_save` | `{ noteId: string; body: string; issuedAt: string; source: 'capture-idle' }` |
| `dispatchTriggerBlurSave` | `trigger_blur_save` | `{ noteId: string; body: string; issuedAt: string; source: 'capture-blur' }` |
| `dispatchRetrySave` | `retry_save` | `{ noteId: string; body: string; issuedAt: string }` |
| `dispatchDiscardCurrentSession` | `discard_current_session` | `{ noteId: string }` |
| `dispatchCancelSwitch` | `cancel_switch` | `{ noteId: string }` |
| `dispatchCopyNoteBody` | `copy_note_body` | `{ noteId: string; body: string }` |
| `dispatchRequestNewNote` | `request_new_note` | `{ source: 'explicit-button' \| 'ctrl-N'; issuedAt: string }` |

**Note**: Rust-side command handlers do not yet exist (deferred to the backend `capture-auto-save` / `handle-save-failure` VCSDD features). The UI adapter is correct and complete; it matches the candidate command names listed in `verification-architecture.md §8`.

### IPC separation invariant: PASS

- `tauriEditorAdapter.ts` (OUTBOUND): calls `invoke(...)` only. Does NOT call `listen(...)`.
- `editorStateChannel.ts` (INBOUND): calls `listen(...)` only. Does NOT call `invoke(...)`.
- This separation is enforced by code structure and verified by grep. No overlap.

---

## Audit 3: Clipboard Surface

The `clipboardAdapter.ts` module wraps `navigator.clipboard.writeText(text)`. The `body` string is raw user-supplied content, and no sanitization is applied — this is intentional per `verification-architecture.md §8`: "the clipboard is a direct user action, and no sanitisation is applied." The `body` field is user-owned content; writing it to the clipboard verbatim is the correct behavior.

No security issue.

---

## Audit 4: Svelte 4 Store Audit (PROP-EDIT-036)

```bash
grep -nrE "from 'svelte/store'" promptnotes/src/lib/editor/ --include='*.ts' --include='*.svelte'
```

Result: ZERO HITS. No `writable`, `readable`, or other svelte/store imports exist in the editor feature. All local state uses Svelte 5 `$state(...)`.

---

## Audit 5: State Mutation Audit (PROP-EDIT-029)

```bash
grep -nrE 'EditingSessionState' promptnotes/src/lib/editor/*.svelte
```

Result: One hit in `EditorPane.svelte:39` — a JSDoc comment in the `Props` interface describing the `stateChannel` prop: `/** Inbound channel that delivers EditingSessionState snapshots from the domain. */`. This is a type reference in a comment, not an assignment or mutation. No component constructs or mutates `EditingSessionState` directly.

`tsc --strict` confirms: `EditorPane.svelte` only imports `type EditingSessionState` transitively (via `editorStateChannel.ts`'s callback type). No component assigns to its fields.

---

## Audit 6: Purity Audit on Pure Modules

```bash
grep -nE 'setTimeout|setInterval|Date\.now|new Date|Math\.random|crypto\.|performance\.|fetch\(|localStorage|sessionStorage|indexedDB|window\.|document\.|navigator|requestAnimationFrame|requestIdleCallback|globalThis|self\.|import\.meta|clearTimeout|clearInterval|@tauri-apps/api|invoke\(|\$state|\$derived|\$effect' \
  promptnotes/src/lib/editor/{editorPredicates,editorReducer,debounceSchedule}.ts
```

Result: 3 hits, all in JSDoc comment lines in `debounceSchedule.ts`:

- Line 8: `* This module NEVER calls Date.now() — the caller provides nowMs.` (comment)
- Line 19: `* last edit. Used to schedule the setTimeout delay in the impure shell.` (comment)
- Line 68: `* - nowMs: current clock time (supplied by caller, never Date.now())` (comment)

These are explicit prohibition reminders in JSDoc, conforming to the pattern allowed by `verification-architecture.md §2`: "only allowed inside comment lines explicitly noting the prohibition." No runtime calls to any forbidden API exist in any pure module.

---

## Summary

| Audit | Result | Evidence |
|---|---|---|
| XSS / code-injection (`eval`, `Function`, `{@html`, etc.) | PASS — zero hits | `security-results/audit-run-2026-05-04.txt` |
| `innerHTML` in production source | PASS — zero hits in `*.ts` / `*.svelte`; test-only teardown use is safe | `security-results/audit-run-2026-05-04.txt` |
| `invoke()` containment | PASS — only in `tauriEditorAdapter.ts`; all 8 commands verified | `security-results/audit-run-2026-05-04.txt` |
| IPC separation (invoke/listen) | PASS — no overlap between adapter and channel | grep audit |
| Clipboard surface | PASS — intentionally unsanitized; user-owned content | spec §8 |
| Svelte 4 store imports | PASS — zero hits | `security-results/audit-run-2026-05-04.txt` |
| `EditingSessionState` mutation | PASS — comment-only reference | `security-results/audit-run-2026-05-04.txt` |
| Purity (forbidden APIs in pure modules) | PASS — comment-only references | `security-results/audit-run-2026-05-04.txt` |
| Wycheproof | Not applicable — no cryptographic operations | n/a |

**Security verdict: PASS**

No actionable security findings. The body content trust boundary (Svelte text bindings, no `{@html}`) is correctly implemented. The Tauri IPC surface is properly contained and separated.
