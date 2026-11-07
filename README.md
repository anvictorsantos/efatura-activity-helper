<p align="center">
  <img src="assets/icon.png" width="140" alt="e-Fatura Activity Helper icon">
</p>

<h1 align="center">e-Fatura Activity Helper</h1>

<p align="center">
  For each pending invoice on the e-Fatura pendências page, read the supplier NIF, look up its
  registered CAE, and highlight the right <em>atividade de realização da aquisição</em> — with the
  portal's own sector codes and a choice when more than one sector fits.
</p>

A Chrome extension (Manifest V3, no runtime dependency, no account and no server) for
`faturas.portaldasfinancas.gov.pt`. It is a suggestion tool: it never submits the e-Fatura form and
never saves on your behalf.

**Docs:** this file for use and behaviour · [`CONTEXT.md`](./CONTEXT.md) for the vocabulary and the
portal facts · [`AGENTS.md`](./AGENTS.md) for the rules any agent or contributor must follow ·
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, debugging and adding a CAE rule.

## Install (unpacked)

```sh
npm install
npm run icons     # writes assets/icon.png and public/icons/*
npm run build     # writes dist/chrome
```

Then `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `dist/chrome`.
Reload the pendências tab after installing or rebuilding.

## What it does

| Step | What happens |
| --- | --- |
| Find the table | A content script matches the table by its `Emitente` and `Atividade de Realização da Aquisição` headers, not by an id. It also understands the ARIA-grid fallback. |
| Read the NIF | Every nine-digit number in the Emitente cell is checked with the Portuguese mod-11 check digit. Only valid NIFs are used. |
| Look up the supplier | nif.pt JSON API (when a free key is configured) → nif.pt public page, which gives the exact Racius slug → VIES (registered name) → Racius (CAE list and activity text) → name keywords. |
| Classify | The primary CAE decides. If it maps to no special sector, **Outro** is the safe primary and the other plausible sectors are offered as alternatives. The activity description is read only when no CAE maps; the name only when the activity says nothing. |
| Highlight | The exact sector button (`value="C05"`) gets a green ring; the row gets a chip with the portal code, the reason, a confidence dot and selectable alternative chips. |
| Apply | `Aplicar` clicks the page's own button. Nothing is submitted and nothing is saved; you still press save in the portal. |

Successful lookups are cached for 30 days in `chrome.storage.local`; a total miss is not cached,
so it can be retried. Requests run one at a time, 350 ms apart.

## What this can and cannot do

- **It is a suggestion.** The registered CAE describes the company, not the specific purchase. A
  company can have a restaurant CAE and still sell you a book.
- **The portal validates the chosen sector against the supplier's CAE/CIRS.** If the registered
  activity does not support the sector, it answers *“O emitente não tem atividade registada
  (CAE/CIRS) pertencente ao setor indicado.”* That is why a secondary-CAE, activity-only or
  name-only suggestion carries a warning, and `Outro` stays one click away.
- **`Outro` is the safe choice** when the primary CAE maps to no special category, or when the
  supplier has several registered activities. It is the correct e-Fatura choice for general family
  expenses, not a failure.
- **A supplier can belong to more than one sector.** A hypermarket can be Outro, Education, Health
  or Hospitality depending on what you bought; the extension offers the choices instead of forcing
  one, and never auto-fills a row that has alternatives.
- **Saúde at 23% IVA needs a prescription.** The chip warns you, but it cannot know whether you
  have one.
- **Habitação and Lares often do not appear in the pending list.** The page itself says rents,
  mortgage interest and public care homes are handled later in the deduções à coleta page.
- **Passes Mensais requires a monthly public-transport pass.** Taxis/TVDE (`4932`) and airlines are
  not passes, and the CAE rules say so.
- **The page markup can change.** Discovery is header- and value-based, not id-based, but a
  redesign can still break it. The panel then says the table was not found; nothing is written to
  the page.
- **nif.pt is a third party.** Its free key is optional, and its terms apply. VIES is the official
  EU service. Racius is a public company directory.
- **No telemetry.** Only the supplier NIF and name leave the browser, to the three services above.
  Nothing is sent to the extension author.

## Category mapping

The rules are CAE prefixes, longest first. Both CAE Rev.3 and Rev.4 keep these divisions.

| e-Fatura activity | Portal code | CAE prefixes |
| --- | --- | --- |
| Saúde | `C05` | `86`, `4773`, `4774`, `47782` |
| Educação | `C06` | `85`, `4761`, `4762`, `88910` |
| Habitação | `C07` | `681`, `682`, `683` |
| Lares | `C08` | `87`, `88` |
| Outro (despesas gerais) | `C99` | everything else, including `47` retail, `35` utilities, `61` telecom |
| Reparação de Automóveis | `C01` | `452`, `453` |
| Reparação de Motociclos | `C02` | `454` |
| Restauração e Alojamento | `C03` | `55`, `56`, `47240` |
| Cabeleireiros | `C04` | `9602` |
| Atividades Veterinárias | `C09` | `750`, `47762` |
| Passes Mensais | `C10` | `491`, `4931`, `4939`, `501`, `503` |
| Ginásios | `C11` | `9311`, `9312`, `9313` |

The portal renders the sectors as a Bootstrap button group: `<button value="C05">` with the label
on the icon's `aria-label` and `data-original-title`. The extension matches the `value` first and
the visible label only as a fallback. The portal may offer only the sectors that apply to a given
invoice, so a secondary code that maps to the same category (for example `C13` Livros or `C26`
Educação) is used when the preferred one is absent.

A supplier can have several registered CAEs, and the portal accepts the sectors those CAEs
support. That is why **Outro** stays the primary for a mixed supplier such as a hypermarket, with
Education, Health or Hospitality offered as alternatives for you to pick. A suggestion based only
on a secondary CAE, the activity description or the name is marked with a warning.

`47782` is optical retail; `96092` (pet services) deliberately stays in Outro.

## Using it

1. Open
   `https://faturas.portaldasfinancas.gov.pt/resolverListaPendenciasAdquirenteForm.action`
   and sign in.
2. The panel appears bottom-right; each pending row gets a chip under the activity buttons.
3. Hover a row to also ring the matching activity card, if the page draws one outside the table.
4. If the chip offers alternatives, click the sector you want — the ring moves — then `Aplicar`.
   Review and save in the portal as usual.
5. Use the toolbar popup to rescan, toggle the panel, or repeat all lookups.

The row chip is colour-coded by confidence: green for a primary CAE, amber for a secondary CAE or
activity phrase, grey for a name or a miss. The `⚠` marks a sector the portal may refuse.

## Options

- **Ativar** — turn injection off without uninstalling.
- **Mostrar o painel** — hide the side panel; the row chips remain.
- **Preencher automaticamente** — fill the control only when there is a single high-confidence
  suggestion. A row with alternatives, a secondary CAE or a low-confidence hint is never
  auto-filled. Off by default.
- **nif.pt key** — optional. Without it, the extension uses the nif.pt public page, VIES and
  Racius. Request a key at <https://www.nif.pt/api/>.
- **Testar um NIF** — shows exactly what each source returned, the primary and the alternatives.
- **Limpar cache** — drops the 30-day supplier cache.

## Development

```sh
npm run typecheck   # tsc --noEmit, strict
npm test            # node --test over src/**/*.test.ts
npm run build       # esbuild → dist/chrome
npm run verify      # typecheck + test + build
npm run icons       # assets/icon.png + public/icons/*
npm run zip         # dist/efatura-activity-helper-<version>-chrome.zip
```

No runtime dependency. Dev-only: `typescript`, `esbuild`, `@types/node`, `@types/chrome`.

### Layout

```
src/core     pure rules: NIF, slug, category aliases, CAE map, sector codes, heuristics, classify
src/infra    nif.pt, VIES, Racius, HTML entities, the lookup chain, chrome.storage, the protocol
src/ui       content script (discovery, chips, shadow-DOM panel), options page, popup
public       manifest, content.css, generated icons
assets       master icon used by the README and by npm run icons
scripts      icon generation, zip
```

Dependency direction points inwards: `core` imports nothing from the other layers, `ui` owns the
DOM, `infra/browser.ts` is the only file that touches `chrome.storage`, and only the background
worker fetches a lookup. The content script never submits the portal form.

### Verification status

- Unit tests cover NIF validation, slugging, category aliases, CAE mapping, the multi-sector
  candidate model, keyword fallback, the Racius/VIES/nif.pt parsers (including Portuguese HTML
  entities), the lookup chain with a fake fetcher, and stored-record validation. **101 tests,
  `node --test`.**
- The lookup chain was checked live against the public sources for the sample NIFs, including a
  supermarket, a hypermarket with several CAEs, a health-card company, a consulting company whose
  activity text mentions hospitality, a pet supplier, and a taxi/TVDE company.
- **The signed-in DOM path is not automated**, because it needs a session on the portal. The
  category control is matched by the portal's own `value` codes (`C01`…`C99`), and the pure
  matching is unit-tested; load the built extension, reload the pendências tab and check one row.

## Troubleshooting

- **No chips appear.** Reload the pendências tab after installing or rebuilding. The content
  script only runs on page load.
- **“Tabela de pendências não encontrada”.** You are not on the list page, or the table headers
  changed. Open *Resolver pendências* and press `⟳` in the panel.
- **The portal rejects a sector.** The supplier's CAE/CIRS does not support it. Choose `Outro`;
  the chip warns before you apply a secondary/activity/name suggestion.
- **A supplier shows Outro but you expected Saúde.** The primary CAE is not a health CAE. Click
  the `Saúde (C05)` alternative if you want it; the portal may still refuse it.
- **`Aplicar` does nothing.** The row has no sector control the extension can see. Choose the
  sector manually; the chip still tells you which one.
- **The data is stale.** Press **Repetir consultas** in the popup; it bypasses the 30-day cache.

## Privacy

- `credentials: 'omit'` on every lookup; no portal session cookie is ever sent to a lookup
  service.
- The nif.pt key lives in `chrome.storage.sync` and is only sent to `nif.pt`.
- Supplier names, activities and CAEs are rendered with `textContent`, never `innerHTML`.
- The extension requests `storage`, `activeTab` (so the popup can read the current tab's URL) and
  three lookup host permissions, nothing else.

## Licence

MIT — see [`LICENSE`](./LICENSE).
