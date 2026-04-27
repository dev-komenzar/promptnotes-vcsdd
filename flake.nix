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
        # webkit2gtk-4.1 + libsoup_3 が Tauri 2.x の前提。glib-networking は
        # WebView 内の HTTPS / TLS バックエンドに必須（無いと https リクエストが silently 失敗）。
        tauriRuntimeDeps = pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          webkitgtk_4_1
          gtk3
          libsoup_3
          glib-networking
          openssl
          glib
          dbus
          librsvg
          cairo
          pango
          atk
          harfbuzz
          gdk-pixbuf
        ]);

        # Tauri build-time deps (Linux only; pkg-config etc).
        # nixpkgs unstable では wrapGAppsHook → wrapGAppsHook3 にリネーム済み。
        tauriBuildDeps = pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          pkg-config
          wrapGAppsHook3
        ]);

        # Tauri ツール群: CLI / dev convenience。
        # cargo-tauri は `tauri` サブコマンドの本体。pnpm の @tauri-apps/cli を使う場合も
        # 入れておくと `cargo tauri info` での診断や CI でのスタンドアロン起動に便利。
        tauriTooling = with pkgs; [
          cargo-tauri
          cargo-watch
          xdg-utils
        ];

        # Bundling 用（`tauri build` で .deb / .rpm / .AppImage を作る時に使う）。
        # 開発中の `tauri dev` には不要だが、揃えておくとリリースビルドが手元で通る。
        # 注: appimagetool / linuxdeploy は Tauri バンドラーがビルド時に取得するため
        # ここでは入れない（オフラインビルドが要るならミラー対応を別途検討）。
        tauriBundlingDeps = pkgs.lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          squashfsTools
          fakeroot
          desktop-file-utils
          file
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          name = "promptnotes-dev";

          packages = with pkgs; [
            # Rust
            rustToolchain

            # Node.js は残す（一部ツール / エディタ拡張が node 実行を前提とするため）。
            # フロントの実行・パッケージ管理は Bun を主に使う。
            nodejs_22
            bun

            # TypeScript CLI (Bun でも tsc は入れられるが nix で揃えた方が再現性が高い)
            # nodePackages.typescript は nixpkgs unstable でトップレベルに移行
            typescript

            # Misc dev utilities
            jq
            git
          ] ++ tauriRuntimeDeps ++ tauriBuildDeps ++ tauriTooling ++ tauriBundlingDeps;

          shellHook = ''
            echo "promptnotes dev shell"
            echo "  rustc:  $(rustc --version 2>/dev/null || echo '(not in PATH)')"
            echo "  node:   $(node --version 2>/dev/null || echo '(not in PATH)')"
            echo "  bun:    $(bun --version 2>/dev/null || echo '(not in PATH)')"
            echo "  tsc:    $(tsc --version 2>/dev/null || echo '(not in PATH)')"
            echo "  tauri:  $(cargo tauri --version 2>/dev/null || echo '(not in PATH)')"

            # Make Rust target dir local to project
            export CARGO_HOME="$PWD/.cargo"
            export RUSTUP_HOME="$PWD/.rustup"

            # WebView 内 HTTPS / TLS のため glib-networking の GIO モジュールを参照させる。
            # これが無いと WebView から外部 API を https で叩いた時に無言で失敗する。
            ${pkgs.lib.optionalString pkgs.stdenv.isLinux ''
              export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules:''${GIO_EXTRA_MODULES:-}"
              export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:''${XDG_DATA_DIRS:-}"

              # NVIDIA / Wayland 環境で WebKit が真っ白になる場合の保険。
              # 必要になったらコメントを外す。
              # export WEBKIT_DISABLE_DMABUF_RENDERER=1
              # export WEBKIT_DISABLE_COMPOSITING_MODE=1
            ''}

            # Bun のキャッシュ / install ストアをプロジェクト内に閉じ込めたい場合:
            # export BUN_INSTALL_CACHE_DIR="$PWD/.bun/install-cache"
            # export BUN_INSTALL="$PWD/.bun"
            # export PATH="$BUN_INSTALL/bin:$PATH"
          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}
