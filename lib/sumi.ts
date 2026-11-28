// sumi (MIT, https://github.com/champierre/sumi) is a Rust library that rewrites
// only a PDF's colour operators to DeviceGray. Text, fonts, vectors, links and
// annotations are copied unchanged, so the output is true grayscale — the text
// stays selectable and searchable — instead of a picture of each page.
//
// It is compiled to WebAssembly and served as static files from /public/sumi:
//   /sumi/sumi_wasm.js       – the wasm-bindgen glue (fetched once, on first use)
//   /sumi/sumi_wasm_bg.wasm  – the converter itself (~1 MB)
// Nothing is uploaded; the PDF never leaves the device.

export type SumiReport = {
  pages: number;
  contentStreams: number;
  colorOperators: number;
  images: number;
  shadings: number;
  warnings: number;
  complete: boolean;
};

export type SumiResult = { pdf: Uint8Array; report: SumiReport };

type SumiModule = {
  default: (init: { module_or_path: string }) => Promise<unknown>;
  sumi_convert: (
    bytes: Uint8Array,
    mode: "grayscale" | "monochrome",
    grayModel: "luma" | "colorimetric",
    threshold: number,
  ) => SumiResult;
};

const GLUE_URL = "/sumi/sumi_wasm.js";
const WASM_URL = "/sumi/sumi_wasm_bg.wasm";

let ready: Promise<SumiModule> | null = null;

export async function getSumi(): Promise<SumiModule> {
  if (!ready) {
    ready = (async () => {
      // Served from /public as a static ES module at runtime, so it is kept out
      // of the bundle with webpackIgnore. The wasm is located by an explicit
      // path, so the glue never needs to guess it from its own URL.
      const mod = (await import(/* webpackIgnore: true */ GLUE_URL)) as unknown as SumiModule;
      await mod.default({ module_or_path: WASM_URL });
      return mod;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
