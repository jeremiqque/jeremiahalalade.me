# jeremiahalalade.me

Personal landing page built with **Astro 6**, implemented from the Figma "Lumis / My iste" frame.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # static build → dist/
npm run preview  # preview the build
```

## Fonts

Local OTF files in `public/fonts/`, loaded via `@font-face` and exposed as CSS variables:

- `--font-heading` → **Nimbu Demo** (the "Jeremiah Alalade" heading)
- `--font-body` → **PP Neue Corp Compact** (bio, email, button)

## Assets

- `public/assets/hand.svg` — the ✌️ hand illustration (from "Vectorized SVG.svg")
- The "More about me to come" pill gradient + inner shadows are recreated in CSS
  from the original "Frame 1261159589.svg" values.

## Notes

The page reproduces only what is in the Figma design — no extra sections or features.
Animation is intentionally not yet added (page-first build).
