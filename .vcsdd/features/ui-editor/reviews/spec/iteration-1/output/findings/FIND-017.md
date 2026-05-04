---
id: FIND-017
severity: minor
dimension: spec_fidelity
targets: ["behavioral-spec.md §6 Glossary line 604", "behavioral-spec.md §8 Open Questions line 637", "behavioral-spec.md §3.1 REQ-EDIT-003"]
---

## Observation

§6 Glossary entry for `Body.isEmptyAfterTrim` (line 604) reads: "Predicate: `true` when the body string is empty after trimming whitespace. Equivalent to `note.isEmpty()`. — aggregates.md `note.isEmpty(): boolean`".

§8 OQ #7 (line 637) says: "The UI must compute `copyEnabled` using the empty-after-trim predicate locally (before the Rust round-trip) ... This is a pure client-side string check (`body.trim().length === 0`)".

The glossary entry does not mention the JS-side computation; OQ #7 does. A reader using the glossary as authoritative will assume the predicate is invoked over Tauri (since `note.isEmpty()` is Rust). A reader of OQ #7 will assume it's local. They are reconciled in the prose but the glossary itself is ambiguous.

## Why it fails

Strict mode penalizes glossary entries that need to be read alongside §8 to be understood. The glossary should be the canonical short reference.

## Concrete remediation

Update the §6 entry to: "`Body.isEmptyAfterTrim` — Predicate: `true` when `body.trim().length === 0` (ECMAScript `String.prototype.trim`). Computed locally in TypeScript for immediate UI feedback (no Tauri round-trip per keystroke). The Rust-side `note.isEmpty()` MUST agree on Unicode-whitespace inputs; Phase 2 backend feature owns that proof."
