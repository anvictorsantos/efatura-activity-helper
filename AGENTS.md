# AGENTS.md — e-Fatura Activity Helper

Applies to every agent and task in this repository. `README.md` explains the lookup chain and the
category table; the source wins when a document disagrees.

## The honesty rule

This extension suggests a tax classification. Four constraints are not negotiable:

1. **A suggestion is not a filing.** Never describe a highlighted or applied row as classified,
   validated, submitted or saved. The user still saves in the portal.
2. **Never submit.** No `form.submit()`, no click on a submit button, no request to the portal's
   save action. `setControl` may set a select, click a radio or click a card; it must stop there.
3. **Never claim a lookup succeeded.** A missing CAE is a state, not an error to hide. The chip
   and the panel must show the source and the confidence, and `low` must say "confirmar".
4. **No telemetry.** Only the supplier NIF and name go to nif.pt, VIES and Racius. No analytics,
   no remote config, no author endpoint.
5. **Ambiguity is shown, not hidden.** A supplier with more than one plausible sector gets Outro
   as the primary and the rest as alternatives. Never auto-fill a row that has alternatives, and
   never present a secondary-CAE, activity or name suggestion as CAE-confirmed.

## Architecture

- `src/core/**` — pure. No DOM, no `chrome.*`, no `fetch`. NIF validation, slugging, category
  aliases, CAE mapping, keyword fallback and the classification precedence. Unit tested.
- `src/infra/**` — the outside world. `nifpt.ts`, `racius.ts` and `vies.ts` parse one response
  each; `lookup.ts` is the chain and takes an injected `fetch`, so it is tested without a
  network. `browser.ts` is the only file that touches `chrome.storage`. `protocol.ts` is the
  worker ↔ page contract and validates both directions.
- `src/background.ts` — the worker. The only context that fetches lookups, reads the cache and
  serialises requests. It never renders.
- `src/ui/**` — the page. `content.ts` owns discovery, row chips, highlighting and the shadow-DOM
  panel. `options.ts` and `popup.ts` are extension pages.
- `public/**` — manifest, CSS, the two HTML pages and the generated icons.

## Rules in code

- **Discovery is header-based.** `Emitente` and `Atividade de Realização da Aquisição` are matched
  through `normalizeText`, so accents and the DataTables sort suffix do not matter. Do not add an
  id or a positional selector as the primary path.
- **The portal's sector code wins.** The activity control is a Bootstrap button group:
  `<button value="C05"><span aria-label="Saúde"></span></button>`, with the label also in
  `data-original-title`. `findControlFor` tries the preferred code (`src/core/sectors.ts`) before
  the label; `setControl` clicks that button, skipping submit buttons and buttons already marked
  `active`. A `<select name="ambitoAquisicao">` is still supported. Do not replace this with a
  text-only matcher.
- **Do not decorate the extension's own UI.** The hint is appended inside the same `<td>` as the
  buttons; the generic control loops skip anything inside `.efv-hint`.
- **A NIF must pass the mod-11 check** before a lookup. `extractNif` already does this; do not
  bypass it with a looser regex.
- **NIFs are the cache key.** `state.knowledge` and the 30-day cache are keyed by NIF only. A row
  that re-renders reuses the answer and must not issue a second request.
- **Evidence order is CAE → activity → name.** `classify.ts` reads `info.activity` only when no
  CAE maps, and the name only when the activity says nothing. A corporate object lists many
  businesses; do not let it add alternatives.
- **Outro is the safe primary.** When the primary CAE maps to no special category (or there is no
  CAE), Outro has rank 1 and the specific sectors are alternatives. Do not promote an alternative
  to primary: the portal validates the chosen sector against the supplier's CAE/CIRS and returns
  *“O emitente não tem atividade registada (CAE/CIRS) pertencente ao setor indicado.”*
- **Every alternative carries its warning.** A secondary CAE, activity-only or name-only draft
  must say the portal may refuse it. `SECONDARY_WARNING`, `ACTIVITY_WARNING` and `NAME_WARNING`
  in `classify.ts` own those sentences.
- **A secondary CAE never becomes the primary.** It is an alternative at `medium`.
- **The 23% health warning is conditional.** Only `saude` rows whose row text mentions 23% get it,
  on the primary and on every `saude` alternative.
- **`Outro` is a real answer.** For general family expenses the page option is `Outro`; do not
  invent a different label.
- **Taxis and airlines are not monthly passes.** `4932` (taxis/TVDE) and `511` (air) are
  deliberately absent from the `passes` rules.
- **Worker input is untrusted.** `parseWorkerRequest` validates the NIF; `parseWorkerResponse`,
  `parseUiRequest` and `validateSupplierInfo` validate what comes back. Widen a field only with a
  matching validation.
- **The background is serialised.** One lookup at a time with a 350 ms gap, and an in-flight map
  per NIF. Keep the gap; three public services are being read.
- **No new dependency.** The build is esbuild and TypeScript only. The extension has no runtime
  dependency and should stay that way.

## DOM rules

- Row chips live in the category cell and use `all: initial` plus `.efv-` classes. Do not style
  portal elements globally.
- A page-level card is only marked for the row the user is hovering/focusing. Do not mark every
  card for every row.
- The alternative chips are the user's decision. `chooseCategory` moves the ring and clears
  `applied`; it never clicks the portal. Only `Aplicar` calls `setControl`.
- `Aplicar` is a real `<button>` and must `preventDefault` + `stopPropagation`; the portal may
  have its own row click handler.
- The panel is a shadow root appended to `document.documentElement`. It uses `createElement` and
  `textContent`; external names never reach `innerHTML`.
- `prefers-reduced-motion` must keep the flash and toast static.

## Verification

- `npm run typecheck` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `erasableSyntaxOnly`.
- `npm test` — `node --test` over `src/**/*.test.ts`.
- `npm run build` — esbuild → `dist/chrome`; MV3 manifest, no runtime dependency.
- The signed-in DOM path is **not** covered by an automated test. Say so; do not imply otherwise.
  A manual check is one pending invoice, one row, the chip text and `Aplicar`.

## Reporting

Concise: changed files, key result, checks actually run, unresolved risks.
