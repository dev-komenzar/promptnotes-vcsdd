// app-startup/errors.ts
// Re-exports for AppStartup-scoped error types from the shared kernel.
// Consumers import from $lib/domain/app-startup/errors to avoid coupling
// directly to the domain-types package path.

export type {
  AppStartupError,
  ScanError,
  VaultConfigError,
} from "promptnotes-domain-types/shared/errors";
