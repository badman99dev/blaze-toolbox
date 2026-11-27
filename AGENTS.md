# AGENTS.md

Guidance for AI agents and contributors working on **Blaze Toolbox**: on-device photo and PDF tools.
Next.js 15 (App Router) + React 19 + TypeScript. No backend. Files never leave the user's device.

## Project map
- `lib/tools.ts` — the list of tools (`slug`, `name`, `blurb`, `meta`). Home grid and static routes come from this.
- `app/page.tsx` — home. `app/tools/[slug]/page.tsx` — one static page per tool.
- `components/Shell.tsx` — site frame: sticky header, `<main>`, footer. `wide` prop widens the container.
- `components/tools/Workbench.tsx` — the simple tools (resize, compress, pdf-to-image, image-to-pdf, pdf-grayscale).
- `components/tools/PassportSheet.tsx` + `passport.module.css` — the passport photo sheet (crop, MaxRects packing, PDF).
- `app/globals.css` — global design tokens and layout.

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
