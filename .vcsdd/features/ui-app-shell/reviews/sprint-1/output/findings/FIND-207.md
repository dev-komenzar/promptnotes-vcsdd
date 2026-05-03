---
id: FIND-207
severity: major
dimension: edge_case_coverage
category: test_quality
relatedReqs: [REQ-005]
relatedCrits: [CRIT-005, CRIT-007]
routeToPhase: 2a
---

# FIND-207 — EC-06 (NUL byte) and EC-17 (picker-revoke) tests assert impossible domain shapes

## Citation
- `promptnotes/src/lib/ui/app-shell/__tests__/vault-modal.test.ts:308-336` — EC-06: `tryVaultPath` returns `{ kind: "path-not-found" } as any` (path-not-found is a `VaultConfigError`, not a `VaultPathError`)
- `promptnotes/src/lib/ui/app-shell/__tests__/vault-modal.test.ts:362-380` — EC-17: `tryVaultPath` returns `{ kind: "permission-denied" } as any` (permission-denied is also a `VaultConfigError`, not a `VaultPathError`)
- `behavioral-spec.md` lines 70-72 — "`VaultPathError` の variants は `value_objects.rs` が真実: `Empty` / `NotAbsolute` の 2 種のみ"

## Description
The spec is unambiguous: `try_vault_path` (Rust `VaultPath::try_new`) only ever returns `VaultPathError::Empty | VaultPathError::NotAbsolute`. `path-not-found` and `permission-denied` are `VaultConfigError` variants surfaced by `invoke_configure_vault`. The spec even has a §"Smart Constructor は Rust 側が真実" callout to emphasize this.

Yet the EC-06 test fakes a `tryVaultPath` that returns `{ kind: "path-not-found" }` (cast to `any`) and the EC-17 test fakes a `tryVaultPath` that returns `{ kind: "permission-denied" }` (cast to `any`). These shapes are not reachable through the domain types and the tests therefore exercise behavior that cannot occur in production. The `as any` casts mask the type violation.

Real EC-17 (picker-then-revoke) would surface a `permission-denied` from `invoke_configure_vault`, not from `try_vault_path`. The current test does NOT exercise the actual code path.

This means contract CRIT-005 / CRIT-007 passThreshold "EC-06 ... assertions present" / "EC-17 ... permission-denied" is satisfied only by mock-shaped test code that bears no resemblance to the real flow.

## Suggested remediation
- For EC-06: assert that `try_vault_path` for a NUL-byte path returns `{ ok: false, error: { kind: "empty" } | { kind: "not-absolute" } }` (whichever Rust actually returns) OR that the path falls through to `invoke_configure_vault` which then returns `path-not-found`.
- For EC-17: rewrite the test so that `try_vault_path` returns `Ok(VaultPath)` (the path is absolute) and `invoke_configure_vault` returns `Err(permission-denied)`, then assert the modal displays the permission-denied message.
- Remove the `as any` casts and let TypeScript catch these type violations at compile time.
