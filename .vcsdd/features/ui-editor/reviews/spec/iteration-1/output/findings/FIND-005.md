---
id: FIND-005
severity: critical
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.7 REQ-EDIT-023", "behavioral-spec.md §3.7 REQ-EDIT-024", "ui-fields.md §重要設計前提 Smart Constructor は Rust 側", "behavioral-spec.md §6 Glossary"]
---

## Observation

REQ-EDIT-023 (line 344) and REQ-EDIT-024 (line 357) require the UI to dispatch `RequestNewNote { source, issuedAt: Timestamp }`. REQ-EDIT-001 (line 60) requires `EditNoteBody { ..., body: Body, ..., issuedAt: Timestamp }`. The §6 Glossary entry for `EditNoteBody` (line 595) again lists `body: Body` and `issuedAt: Timestamp`.

`ui-fields.md §重要設計前提` (lines 14-25) is unambiguous:
> `NoteId` / `Tag` / `Body` / `Frontmatter` / `VaultPath` / `Timestamp` は **TypeScript 側で構築不能**（Brand 型 + unique symbol）。UI は raw 文字列 / 数値を受け付け、**Tauri command 経由で Rust 側 `try_new_*` を呼ぶ**。

So the UI literally cannot construct a value of type `Body` or `Timestamp` from inside a Svelte component. Yet REQ-EDIT-001/023/024 require exactly that. The behavioral spec never says how the UI obtains a `Timestamp` for `issuedAt`, nor how `body: string` becomes `body: Body`. RD-003 says Tauri command names are deferred to the backend feature — but `try_new_body` and a clock command are not backend save-handler concerns; they are prerequisites for *every* command this feature dispatches.

## Why it fails

Phase 2 cannot construct any of the listed payloads under the type contract specified. The Builder must invent — pick a clock adapter (`Date.now()`? Tauri call?) and pick a Body construction path (raw `string` smuggled into `Body`? Tauri round-trip per keystroke?). Either choice has correctness consequences (`Date.now()` taints the pure tier; per-keystroke Tauri makes NFR-EDIT-004 input-lag hostile). Strict mode cannot leave this open.

## Concrete remediation

Add a new REQ-EDIT-028 (or amend §3.8) titled "Brand-Type Construction Contract" answering:
1. Does the UI send raw `string`/`number` over Tauri and the backend constructs `Body`/`Timestamp`? Then update the type signatures of `EditNoteBody`, `RequestNewNote`, etc., shown in this spec to use `string`/`number` at the UI boundary and rename or cite the wire format explicitly.
2. Does the UI inject a clock port (`ClockAdapter.now(): Promise<Timestamp>`)? Then declare it in §2 of verification-architecture.md alongside `EditorIpcAdapter` and forbid `Date.now()` in pure modules.

Update the glossary types for `EditNoteBody`/`RequestNewNote` to use the wire-format types. Update PROP-EDIT-001/021 acceptance to clarify what value the integration test actually inspects.
