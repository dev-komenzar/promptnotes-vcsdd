{
  description = "promptnotes — Tauri + Svelte + Rust + TypeScript dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };

        # Rust toolchain (stable + rustfmt + clippy + rust-analyzer)
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rustfmt" "clippy" "rust-analyzer" ];
        };

        # Tauri runtime deps (Linux). Other platforms get harmless empty list.
        tauriRuntimeDeps = pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          webkitgtk_4_1
          gtk3
          libsoup_3
          openssl
          glib
          dbus
          librsvg
        ]);

        # Tauri build-time deps (Linux only; pkg-config etc).
        tauriBuildDeps = pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          pkg-config
          wrapGAppsHook
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          name = "promptnotes-dev";

          packages = with pkgs; [
            # Rust
            rustToolchain

            # Node.js + pnpm (pinned to LTS-ish versions via nixpkgs)
            nodejs_22
            pnpm

            # TypeScript CLI (pnpm でも入れられるが nix で揃えた方が再現性が高い)
            # nodePackages.typescript は nixpkgs unstable でトップレベルに移行
            typescript

            # Misc dev utilities
            jq
            git
          ] ++ tauriRuntimeDeps ++ tauriBuildDeps;

          shellHook = ''
            echo "promptnotes dev shell"
            echo "  rustc:  $(rustc --version 2>/dev/null || echo '(not in PATH)')"
            echo "  node:   $(node --version 2>/dev/null || echo '(not in PATH)')"
            echo "  pnpm:   $(pnpm --version 2>/dev/null || echo '(not in PATH)')"
            echo "  tsc:    $(tsc --version 2>/dev/null || echo '(not in PATH)')"

            # Make Rust target dir local to project
            export CARGO_HOME="$PWD/.cargo"
            export RUSTUP_HOME="$PWD/.rustup"

            # Ensure pnpm uses local store inside project (optional; comment out
            # if you prefer the global pnpm store).
            # export PNPM_HOME="$PWD/.pnpm"
            # export PATH="$PNPM_HOME:$PATH"
          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}
