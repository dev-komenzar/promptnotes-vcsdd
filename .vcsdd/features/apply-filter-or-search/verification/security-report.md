# Security Hardening Report

## Feature: apply-filter-or-search | Sprint: 1 | Date: 2026-05-01

## Tooling

| Tool | Version / Status | Purpose |
|------|-----------------|---------|
| svelte-check | available (bun run check) | Full-project TypeScript type checking via tsc |
| semgrep | NOT INSTALLED | Static pattern-based security scanning |
| Wycheproof | NOT APPLICABLE | Cryptographic test vectors — no cryptography in this feature |
| cargo-audit / npm-audit | NOT RUN | Dependency vulnerability scan — out of scope for pure domain logic |
| eslint | NOT CONFIGURED | Linting; no eslint config present in promptnotes/ |

Raw output location: `verification/security-results/typecheck.log`

### svelte-check output (summary)

Run: `cd promptnotes && bun run check`
Result: exit code 1 — 532 files checked, 3 errors, 0 warnings.

Errors found:

1. `src/lib/domain/__tests__/apply-filter-or-search/__verify__/prop-011a-trynew-tag-reuse.harness.test.ts` line 109:48
   Type error: `string` is not assignable to branded type `Tag` in a `toBe()` call.
   Scope: test harness only — does not affect production source.

2. `src/lib/domain/__tests__/edit-past-note-start/pipeline.test.ts` line 58:13
   `Type 'SwitchError' is not assignable to type 'never'`.
   Scope: a different feature's test file — unrelated to apply-filter-or-search.

3. `src/lib/domain/__tests__/edit-past-note-start/__verify__/prop-005-switch-error-exhaustive.harness.test.ts` line 19:13
   Same `SwitchError` exhaustiveness issue — unrelated feature.

No errors were found in any of the four production source files (`try-new-tag.ts`, `parse-filter-input.ts`, `apply-filter-or-search.ts`, `index.ts`) or in any apply-filter-or-search test file other than prop-011a.

### semgrep

Not installed. Install command: `pip install semgrep` or `brew install semgrep`.
The feature is fully pure (no I/O, no network, no filesystem), so the attack surface for pattern-based security rules is minimal. Manual review confirms no injection points, no input deserialization, no external calls.

### Wycheproof

Not applicable. This feature contains no cryptographic operations.

## Summary

The security hardening sweep for apply-filter-or-search finds no security defects in the production source. The feature is a closed pure-function pipeline with no I/O, no external calls, and no mutable shared state.

**Findings:**

- One type-annotation gap in `prop-011a-trynew-tag-reuse.harness.test.ts` (line 109): a branded `Tag` value is compared to a plain `string` literal using `toBe()`. This does not affect runtime behavior — bun:test passes because both values hold the same underlying string at runtime — but svelte-check rejects it at the TypeScript level. Risk: low. Recommended fix: cast with `as unknown as string` in that specific assertion. This is a harness defect, not a production defect.

- Two unrelated errors in the `edit-past-note-start` feature's test files: out of scope for this report.

**Residual risk:** negligible. Pure domain functions with no I/O have a minimal security surface. No network endpoints, no file paths, no user-supplied format strings passed to dangerous sinks.
