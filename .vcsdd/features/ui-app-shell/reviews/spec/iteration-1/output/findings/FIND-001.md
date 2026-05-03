# FIND-001: Inconsistent naming for the Rust `VaultPath` smart constructor

- **id**: FIND-001
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:14` ("`VaultPath::try_new`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:17` ("Rust `try_new_vault_path`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:29` ("Rust `VaultPath::try_new`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:57` ("Rust `try_new_vault_path`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:125` ("Rust `VaultPath::try_new`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:128` ("Rust `try_new_vault_path`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:130` ("Rust `try_new_vault_path`")

## referenceCitation
- `docs/domain/code/rust/src/value_objects.rs:213` — actual signature is `pub fn try_new(_raw: &str) -> DomainResult<Self, VaultPathError>` (i.e. an associated method `VaultPath::try_new`, not a free function `try_new_vault_path`).
- `docs/domain/ui-fields.md:23` — uses the name `try_new_vault_path`.

## description
The spec uses two different names for the Rust smart constructor: `VaultPath::try_new` (the actual associated-method name in `value_objects.rs`) and `try_new_vault_path` (the name used in `docs/domain/ui-fields.md`). Whether these refer to the same Rust function, to a free wrapper, or to a Tauri command name (`try_vault_path` is also introduced in REQ-004) is never clarified. The spec is supposed to be the authoritative resolution of this exact ambiguity, since the Builder explicitly flagged that "Builder reports only 2 variants: `Empty`, `NotAbsolute`" came from `value_objects.rs`. Two engineers would now reasonably implement (a) a `#[tauri::command] fn try_vault_path` that calls `VaultPath::try_new` directly, and (b) a `#[tauri::command] fn try_new_vault_path` mirroring ui-fields.md, leading to incompatible Tauri command names. Per the anti-leniency rules ("If you find spec ambiguity that two engineers could implement differently, that is a MAJOR finding"), this is major.

## suggestedRemediation
Pick one canonical Tauri command name (the spec already chose `try_vault_path` in REQ-004) and rewrite every other prose reference to read consistently. State explicitly: "Tauri command `try_vault_path` (TS-side name) → wraps Rust associated method `VaultPath::try_new` (Rust-side name); the free-function alias `try_new_vault_path` mentioned in `docs/domain/ui-fields.md` is documentation shorthand and is NOT the Tauri command name." Add this binding to a "Tauri command surface" table.
