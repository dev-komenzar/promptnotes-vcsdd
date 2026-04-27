//! Domain model type definitions.
//!
//! Source of truth for the Shared Kernel and the Vault Bounded Context.
//! TypeScript bindings are generated separately by `ts-rs` and live under
//! `docs/domain/code/ts/src/shared/`.
//!
//! Phase 10 invariant: this crate exposes type signatures only.
//! Function bodies are intentionally left unimplemented (`todo!()`).

pub mod errors;
pub mod events;
pub mod result;
pub mod snapshots;
pub mod value_objects;
pub mod vault;
