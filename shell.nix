{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Node.js and package manager
    nodejs_22
    pnpm

    # Rust toolchain
    rustc
    cargo
    rustfmt
    clippy

    # Build tools
    pkg-config
    openssl
  ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
    pkgs.libiconv
  ];

  shellHook = ''
    export RUST_BACKTRACE=1
  '';
}
