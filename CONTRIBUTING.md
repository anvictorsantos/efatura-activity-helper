# Contributing

## Ground rules

- Read `AGENTS.md` first. The honesty rule there is the whole design.
- Read the relevant part of `CONTEXT.md` before renaming a concept or adding a sector — its
  vocabulary is the one the code uses.
- One cohesive change per PR, typed, with the checks run and reported.
- **Adding a CAE rule is cheap.** Changing the evidence order (CAE → activity → name) or the
  “Outro is the safe primary” rule is a product decision — open an issue first.
- Never add a form submit, an auto-save, a telemetry endpoint or a runtime dependency.

## Setup

```bash
npm install
npm run icons        # assets/icon.png + public/icons/*
npm run build        # dist/chrome
npm run verify       # typecheck + unit tests + build
```

Load `dist/chrome` unpacked in `chrome://extensions`. After a change, press *Reload* on the
extension card and reload the pendências tab; the content script only runs on page load.

## Debugging

- **The panel** (bottom-right) lists every row, the primary and the alternatives. Its `⟳` rescans
  the table; the popup’s **Repetir consultas** bypasses the 30-day cache.
- **Options → Testar um NIF** shows the raw supplier data, the source, the primary, every
  alternative and the portal code. Use it before touching the UI.
- **Clear the cache** in the options after changing a parser or a CAE rule, otherwise the old
  `SupplierInfo` is reused for up to 30 days.
- The content script logs nothing by default. Inspect the page with DevTools; the chips and panel
  are ordinary DOM and shadow DOM.

## Adding a CAE rule

1. Add the longest prefix to `RULES` in `src/core/cae.ts` and a readable name to `NAMES`. The
   longest prefix wins, so `47762` beats `477`.
2. Add a case to `src/core/cae.test.ts`, including a negative one when the code is a near miss
   (taxis are not passes, office equipment is not optics).
3. If the rule changes a sector’s preferred code, update `PREFERRED_SECTOR` in
   `src/core/sectors.ts`.
4. Update the table in `README.md` and, if the rule is subtle, the notes in `CONTEXT.md`.

## Adding a sector

1. Add the id to `CategoryId` in `src/core/types.ts`.
2. Add the label, aliases and hint to `CATEGORIES` in `src/core/categories.ts`.
3. Add the portal’s preferred code to `PREFERRED_SECTOR` and the reverse mapping to
   `SECTOR_CATEGORY` in `src/core/sectors.ts`. The portal’s catalog is the authority for the code.
4. Add a heuristic pattern only if the portal has no CAE for it; keep the order deliberate
   (veterinary before health, restauração before auto).
5. Add tests for the alias, the code and a representative classification, then update the README
   table.

## Before opening a PR

```bash
npm run verify
npm run zip
```

Report what actually ran. The signed-in DOM path is not automated; if you touched
`src/ui/content.ts`, say which row and which button you checked manually.
