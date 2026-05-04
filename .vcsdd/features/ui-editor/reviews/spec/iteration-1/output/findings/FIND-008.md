---
id: FIND-008
severity: major
dimension: verification_readiness
targets: ["verification-architecture.md §3 Tier 0 (line 53)", "verification-architecture.md §5 lint rules", "verification-architecture.md §7 Phase 5 lint gate", "promptnotes/package.json"]
---

## Observation

`verification-architecture.md` references two ESLint rules as Tier 0 / Phase 5 gates:

- `no-direct-session-state-write` for PROP-EDIT-029 (lines 139, 211)
- `no-svelte4-writable-for-editor` for PROP-EDIT-036 (lines 146, 212)

§7 Phase 5 gate (line 290) says "must report zero violations". §3 Tier 0 (line 53) implicitly relies on these as compile/lint-time guarantees.

`promptnotes/package.json` contains no `eslint`, no `@typescript-eslint/*`, no `eslint-plugin-svelte`, and there is no `.eslintrc*` or `eslint.config.*` under `promptnotes/` or at repo root. Custom rules in particular require an ESLint plugin author or a local plugin file. None exists.

## Why it fails

The two ESLint rules are the only mechanical enforcement of two REQ-EDITs (REQ-EDIT-014 state ownership and NFR-EDIT-008 Svelte 5 runes-only). Without the toolchain, both REQs are unverifiable: a Svelte file could `import { writable } from 'svelte/store'` for editor state and ship through every gate green.

## Concrete remediation

Either (a) add an explicit Phase 2 setup PROP that requires installing `eslint`, the relevant plugins, and authoring the two custom rules (with file paths, e.g., `promptnotes/eslint-rules/no-direct-session-state-write.js`) before any Red test is written; or (b) replace these lint gates with a simpler grep audit (e.g., `grep -r "from 'svelte/store'" src/lib/editor` and manual review of `EditingSessionState` mutation sites) and update §5 + §7 accordingly. Strict mode requires that a gate that is named must actually be executable.
