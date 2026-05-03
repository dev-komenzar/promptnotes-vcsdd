---
id: FIND-405
severity: medium
dimension: edge_case_coverage
category: missing_edge_case
relatedReqs: [REQ-004]
relatedCrits: [CRIT-005]
routeToPhase: 2b
---

# FIND-405 — `try_vault_path` Unix-only absolute-path check breaks Windows

## Citation
- `promptnotes/src-tauri/src/lib.rs:104-112`:
  ```rust
  fn try_vault_path(raw_path: String) -> Result<String, VaultPathErrorDto> {
      if raw_path.trim().is_empty() {
          return Err(VaultPathErrorDto::Empty);
      }
      if !raw_path.starts_with('/') {
          return Err(VaultPathErrorDto::NotAbsolute);
      }
      Ok(raw_path)
  }
  ```

## Description
The validator uses literal `starts_with('/')` to determine "is absolute". On Windows:
- `C:\Users\foo` — does not start with `/` → rejected as NotAbsolute (incorrect).
- `\\server\share` — does not start with `/` → rejected as NotAbsolute (incorrect).
- `\\?\C:\foo` — does not start with `/` → rejected as NotAbsolute (incorrect).

Tauri 2 + SvelteKit + Bun is a cross-platform desktop framework (per `MEMORY.md` "Tauri 2 + SvelteKit + Bun デスクトップアプリ"). The behavioral-spec does not exclude Windows. The expected behavior is that any OS-absolute path passes the validator.

The standard library has `std::path::Path::is_absolute()` which is platform-correct. Alternatively, the spec calls out that "Rust 側の associated method 名は `VaultPath::try_new`" — there should be a canonical implementation in `promptnotes/src-tauri/src/domain/value_objects.rs` already; the Tauri command should delegate to it, not duplicate (and break) the logic.

This also reinforces FIND-401: instead of writing a fresh validator, the Tauri command should be a thin wrapper around the domain function.

## Suggested remediation
- Replace `if !raw_path.starts_with('/')` with `if !std::path::Path::new(&raw_path).is_absolute()`.
- Better: `try_vault_path` should call `domain::value_objects::VaultPath::try_new(&raw_path)` and convert the resulting error to the DTO.
- Add a test case in `vault-modal.test.ts` (or a Rust unit test) covering a Windows-style absolute path string and asserting `Ok(...)`.
