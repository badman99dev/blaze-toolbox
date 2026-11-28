# Building the grayscale engine (sumi → WebAssembly)

The **Color PDF to grayscale** tool runs [sumi](https://github.com/champierre/sumi)
(MIT, Rust) compiled to WebAssembly. It rewrites only a PDF's colour operators to
DeviceGray, so text, fonts and vectors are kept and the words stay selectable.

The compiled output is committed under `public/sumi/`, so the app is a plain
Next.js build and needs no Rust toolchain — only rebuild when bumping sumi.

## Rebuild

```sh
cd wasm
./build.sh
```

`build.sh` clones sumi, makes sure the `wasm32-unknown-unknown` target and
`wasm-pack` are installed, builds the wrapper crate in `sumi-wasm/` with
`--target web`, and copies the glue + wasm into `../public/sumi/`.

Toolchain: Rust 1.88 or newer (sumi uses edition 2024). `wasm-pack` is used only
for its wasm-bindgen glue generation.

## How it is loaded in the browser

`lib/sumi.ts` imports `/sumi/sumi_wasm.js` at runtime with a `webpackIgnore`
dynamic import (so it stays out of the bundle), then calls the default export
with the wasm path. The wasm is served from `public/` with the `application/wasm`
MIME type, so it uses `WebAssembly.instantiateStreaming`. Everything runs on the
device; no PDF is uploaded.
