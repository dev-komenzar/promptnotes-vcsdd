//! Vault Bounded Context — Rust が真実を持つ Supporting Subdomain。
//!
//! 由来:
//!   - aggregates.md §4 Vault Aggregate
//!   - workflows.md Workflow 1 (AppStartup), Workflow 9 (ConfigureVault)
//!   - workflows.md Workflow 2/4/5 のうち Vault 側ステップ（writeMarkdown, trashFile）
//!
//! 言語境界（.ddd-session.json `decisions.languageBoundary`）:
//!   Vault Context は Rust に閉じる。Capture/Curate は本モジュールの型を
//!   Public Domain Event 経由でしか触らない。

pub mod aggregate;
pub mod ports;
pub mod stages;
pub mod workflows;
