#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d sumi ]; then
  git clone --depth 1 https://github.com/champierre/sumi.git sumi
fi

rustup target add wasm32-unknown-unknown

if ! command -v wasm-pack >/dev/null 2>&1; then
  curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh
fi

wasm-pack build ./sumi-wasm --release --target web --out-dir pkg --out-name sumi_wasm

mkdir -p ../public/sumi
cp ./sumi-wasm/pkg/sumi_wasm.js ./sumi-wasm/pkg/sumi_wasm_bg.wasm ../public/sumi/
cp sumi/LICENSE ../public/sumi/LICENSE.txt
echo "done — public/sumi updated"
