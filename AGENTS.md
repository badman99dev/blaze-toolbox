# AGENTS.md

Guidance for AI agents and contributors working on **Blaze Toolbox**: on-device photo and PDF tools.
Next.js 15 (App Router) + React 19 + TypeScript. No backend. Files never leave the user's device.

## Project map
- `lib/tools.ts` — the list of tools (`slug`, `name`, `blurb`, `meta`, `cat`, `mode`, `tags`) and the `CATEGORIES`/`MODES`/`TAGS`. Home grid and static routes come from this.
- `app/page.tsx` — home. `app/tools/[slug]/page.tsx` — one static page per tool. `app/privacy/page.tsx` — the privacy page (static, long-form `.prose`), linked from the header nav and footer.
- `components/Shell.tsx` — site frame: sticky header, `<main>`, footer. `wide` prop widens the container.
- `components/tools/Workbench.tsx` — the simple tools (compress, image convert, HEIC to JPG, SVG to PNG, favicon pack, circle crop, watermark, Base64, PDF to image, image to PDF, PDF grayscale, PDF merge/split/rotate/unlock/lock).
- `components/tools/ImageResize.tsx` — the image resize tool: cropperjs crop stage (free + fixed ratios, rotate/zoom/reset) with optional width/height typing and a format/quality output. Rendered for `image-resize` in `app/tools/[slug]/page.tsx`; it is no longer in `Workbench`.
  - Default output format follows the input: JPG for photos, PNG only for PNG/GIF (transparency). Never default a photo to PNG — lossless PNG can turn a 150 KB JPEG into multi-MB output. The UI hints at this.
- `components/tools/PassportSheet.tsx` + `passport.module.css` — the passport photo sheet (crop, MaxRects packing, PDF).
- `app/globals.css` — global design tokens and layout.

## Home categories
- Every tool in `lib/tools.ts` has a `cat`: `everyday` (normal users), `edit` (photo/image editing), or `dev` (developer/technical). `CATEGORIES` holds the section order, titles and descriptions.
- The home page renders one `.tools` auto-fit grid per category with a `.tools-head` heading. Keep that order (everyday first, then editing, then developer). Adding a tool only needs a `cat` — no hard-coded lists. Same `.cell` markup, so the fluid rules below apply automatically.
- The home list is rendered by `components/ToolSearch.tsx` (a client component) rather than `app/page.tsx` directly, so the whole tool list can be filtered in place. It keeps the same `.tools-section` / `.tools-head` / `.cell` markup. The search is a plain case-insensitive AND-of-words filter over `name + blurb + meta + slug + cat`, so typing “pdf”, “passport” or “resize” narrows the cards live and empty sections disappear; an empty query shows everything. `/` focuses the box, `Escape` clears it. It is all client-side — no index is fetched. The sticky search bar sits just below the header (`.search`, `top:4.75rem`).
- Below the search box is a **file-type chip row** (`.chips`, `All` + one `.chip` per media type). Every tool has `tags: MediaTag[]` (`image` / `pdf` / `video` / `text`), the union of what it takes in and gives out — e.g. `passport-photo` is `["image", "pdf"]`, `image-to-base64` is `["image", "text"]`. `All` is on by default (no filter); any number of chips can be active at once and a tool shows if it has **any** of the picked tags (OR). The chip set is derived from `TAGS` (`lib/tools.ts`) but only tags that at least one tool actually uses are rendered, so there is no dead `Video` chip until a video tool exists. Search words and chips combine (AND). Add a tag by giving a tool a `tags` entry — no hard-coded chip lists.
- Every tool also has a `mode`: `local`, `cloud`, or `hybrid`. `components/ModeTag.tsx` renders a small badge (icon + label) at the top-right of each card via `MODES`. **Every current tool is `local`** — nothing is uploaded and there is no server processing, so do not invent `cloud`/`hybrid` labels. If a real server-backed tool is added later, set its `mode` and the badge/icon already exist. Never relabel a local tool as cloud.

## Layout rules (important)
The site is a **plain, fluid website**. It must look right at any viewport width and any browser zoom (25% to 500%).
- Do NOT bring back graph-paper backgrounds, rulers on the page chrome, floating "sheets", or fixed-width cards.
- Size with `rem`, `%`, `clamp()`, `min()`, `max()`, `vw`/`dvh`. Avoid fixed `px` widths/heights for layout (hairlines and borders are fine).
- Page containers use `.wrap` (`--maxw` grows with the viewport) and `.wrap.wide` for tool pages that need room.
  Header, main and footer share the same container so their left edges align.
- Grids reflow by themselves: `repeat(auto-fit, minmax(min(100%, Xrem), 1fr))`. Avoid hard-coded column counts and magic breakpoints.
- The one structural breakpoint is `62rem` (passport tool switches from side-by-side to stacked). Use `rem` in media queries so it follows zoom.
- Every flex/grid child that holds text or inputs needs `min-width: 0`. No horizontal page scroll at 320px.
- Touch targets are at least `2.75rem` high. Respect `prefers-reduced-motion`.

## Passport tool: preview must fit the screen
- The tool (`.app`) is sized to the screen: `--app-h: clamp(26rem, calc(100dvh - 9rem), 200rem)`. The preview column is sized to the A4 page ratio (`--main-w`); the controls panel takes all the remaining width. The title is compact on this page.
- The A4 preview auto-fits **by width and by height** (see the `calc` effect in `PassportSheet.tsx`), so one whole sheet is visible with no scrolling by default.
  `Fit` resets to this; `+` / `-` zoom from there.
- If you add chrome above the tool, update the `9rem` offset in `passport.module.css` (two places) to match.
- Print: `body.ps-printing` hides page chrome and prints only the A4 pages. Keep that working.

## Help popups (passport tool)
- The round `i` buttons beside Page margin, Set each side separately and Gap open a dialog with an illustration and a short text (`HELP` in `PassportSheet.tsx`).
- The illustration is drawn in code as inline SVG (`HelpDiagram`): an A4 sheet with placeholder passport photos (unknown-person silhouette) and the explained part highlighted. No image files, so nothing to load. Add a topic by adding an entry in `HELP` and a branch in `HelpDiagram`.

## Simple tool pages (Workbench)
- `.wb` is an auto-fit grid: controls (`.wb-in`) and result (`.wb-out`) sit side by side when there is room and stack on phones. No breakpoint needed.
- Keep it that way: new simple tools plug into `Workbench.tsx` and inherit this layout.
- Multi-file tools (`cfg.multi`) **append**: re-picking the file dialog adds more instead of replacing. Selected files show as a `.picks` list with a ✕ remove button each, and tools where order matters (`pdf-merge`, `image-to-pdf`, `pdf-page-numbers`) also get ▲▼ to reorder — `files` order is the output order. Duplicates (same name+size+lastModified) are ignored. Single-file tools still replace on re-pick. `pdf-merge` refuses fewer than two PDFs.
- Tools handled here: compress, compress to a target size, image convert, HEIC to JPG, SVG to PNG, favicon pack, circle crop, watermark, image to Base64, PDF to image, image to PDF, PDF grayscale, PDF merge, PDF split, PDF rotate, PDF unlock, PDF lock, PDF page numbers.
- **Compress to a target size** (`image-target-size`) is the same canvas encoder driven by a number instead of a slider: `shrinkToTarget()` binary-searches the highest JPEG/WebP quality that still fits the target, and if even `MIN_QUALITY` (28%) is too big it steps the pixel size down (`× 0.82` per pass) until it fits or the long edge hits `MIN_LONG_EDGE` (320 px). Multi-file; each photo is fitted on its own. The result note says either “Fits <target> …” or, if the target is impossible, the smallest it could make. JPG or WebP only (lossless PNG cannot hit a byte target). `drawFrom(src, w, h, fill)` is the shared downscaler — it white-fills for JPG and keeps alpha for WebP.
- **Add page numbers** (`pdf-page-numbers`) uses `pdf-lib`: for each page it draws real text with `page.drawText` at a position chosen from 11 spots (top/middle/bottom × left/center/right, plus `outside` = odd pages right, even pages left). The pattern supports `{NUM}` and `{CNT}` (and `{n}`/`{total}`); number style is arabic (with optional leading-zero `digits`), roman, or alpha; spacing is in millimetres (`MM = 72 / 25.4`). Standard fonts only (Helvetica / Times / Courier, bold + italic variants). `firstPage`/`lastPage` skip pages; `firstNumber` offsets; `continuous` carries the count across multiple files and makes `CNT` the total across all files. Text width comes from `font.widthOfTextAtSize`. This mirrors PDF24's option set — note PDF24 does the work on its servers; ours stays on the device.
- Image resize is its own component (`ImageResize.tsx`, cropperjs); see the project map. Keep typing the output size optional — leaving width and height empty keeps the cropped pixels.
- New controls live in the `.opts` auto-fit grid (`label` with input/select/range/checkbox) so they reflow and keep `2.75rem` touch targets. Text, password and colour inputs are styled globally.
- Unlock PDF uses **qpdf compiled to WebAssembly** (`@neslinesli93/qpdf-wasm`), loaded lazily only inside that branch. The 1.3 MB `qpdf.wasm` is committed at `public/qpdf/qpdf.wasm` and located via `locateFile: () => "/qpdf/qpdf.wasm"`. It runs `qpdf --decrypt [--password=…] -- in.pdf out.pdf` in the wasm FS and returns the plain bytes. This is what reliably handles real-world protected PDFs (xref streams, AES-256, owner-only restrictions) — plain `pdf-lib` / `@cantoo/pdf-lib` leave modern files encrypted on save, so don't switch back. It removes owner/permission restrictions (empty user password) and removes a user password only when the user supplies it. **Lock PDF** uses the same wasm: `qpdf --encrypt <password> <password> 256 [--print=none] [--extract=n] -- in.pdf out.pdf` (AES-256; user and owner password are the same). Never claim to crack an unknown password — a PDF no reader can open without the password cannot be unlocked without it.
- **PDF grayscale** (`pdf-grayscale`) uses **sumi compiled to WebAssembly** (MIT Rust, `github.com/champierre/sumi`) — not pdf.js rasterising. sumi rewrites only the colour operators to DeviceGray (it also switches `cs`/`CS` and their `sc`/`scn` operands to a single gray value), so text, fonts, vectors, links and annotations are copied through: the output is true grayscale and the words stay **selectable and searchable**. It never uploads anything. The glue is loaded at runtime from `public/sumi/sumi_wasm.js` through a `webpackIgnore` dynamic import in `lib/sumi.ts` (so it stays out of the bundle); the wasm is `public/sumi/sumi_wasm_bg.wasm` (~1 MB, served as `application/wasm`). The wrapper crate and build steps live in `wasm/` (see `wasm/README.md`). **Do not go back to the old "draw each page onto a canvas, grey the pixels, embed a JPEG" pipeline** — it loses all text on every file and inflates the size (benchmarked ~4.5x, text lost on 950/950 files). The UI offers a Grayscale tone model: Luma (PDF spec) or Colorimetric (closer to print).

## Loading rules (keep the site light as tools grow)
- Every tool page is static, but nothing is fetched until the user opens it: all `<Link>`s use `prefetch={false}`.
- Tool components are loaded with `next/dynamic` in `app/tools/[slug]/page.tsx`, so opening one tool never downloads another tool's code. Do not import tool components statically there.
- Tool-only CSS and libraries (e.g. `cropperjs` and its CSS) are imported inside that tool's component, never in `layout.tsx`.
- Heavy libs used on a button press (`pdf-lib`, `pdfjs-dist`) stay behind `await import(...)`.

- Loading UI: there is no `loading.tsx`, so the current page stays on screen while the next one loads. Put `<LinkPending variant="card|inline|bar" />` (uses `useLinkStatus`) inside a `<Link>` to show the indicator (top bar + document/photo animation) right where the user clicked. Keep it CSS-only and respect `prefers-reduced-motion`.
- Never spin forever: after a new deploy an open tab can point at old hashed chunks. `components/ChunkGuard.tsx` (mounted in `layout.tsx`) reloads once on a chunk-load error, and `LinkPending` swaps "Opening..." for a Reload button after 8s, then auto-reloads. `app/error.tsx` + `app/global-error.tsx` give a reload path too. Keep these.

## Adding a tool
1. Add an entry to `TOOLS` in `lib/tools.ts` and an icon in `components/Icon.tsx`.
2. Simple tool: add a config in `Workbench.tsx`. Complex tool: new component in `components/tools/`, then render it in `app/tools/[slug]/page.tsx`.
3. Everything runs in the browser (canvas, `pdf-lib`, `pdfjs-dist`). Never upload user files anywhere.

## Verify before you commit
- `npx tsc --noEmit` passes. `npm run build` needs network for Google Fonts.
- Check in a browser at roughly 320, 768, 1440 px wide and at 50% and 200% zoom, on the home page and the passport page.
- No horizontal scrollbar, no clipped buttons, the A4 preview fully visible on first load.

## Git and secrets
- Never commit tokens, keys or `.env` files. Never put a token in a remote URL or git config.
- If a temporary token is used to push, pass it inline for that one command, then tell the owner to revoke it.
- Keep commits small, with a clear message.
