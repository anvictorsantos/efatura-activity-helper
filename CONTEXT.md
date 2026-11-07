# CONTEXT.md — vocabulary and portal facts

Read this before renaming anything or adding a rule. Terms below are the ones the code uses.
`README.md` explains the behaviour; `AGENTS.md` holds the rules; the source wins when a document
and the code disagree.

## Objects

| Term | Meaning |
| --- | --- |
| **Pending row** | One `<tr>` in the pendências table on `resolverListaPendenciasAdquirenteForm.action`. |
| **Emitente cell** | The cell whose header contains `Emitente`; it holds the supplier name and, usually, the NIF. |
| **NIF** | Nine digits with a mod-11 check digit. Only a valid NIF is looked up. |
| **Supplier** (`SupplierInfo`) | `nif`, `name`, `cae`, `caes`, `activity`, `source`, `note`. `caes[0]` is the primary registered activity. |
| **CAE** | The Portuguese activity code (five digits). Rev.3 and Rev.4 share the divisions used here. |
| **CIRS** | The IRS activity code. The portal validates against CAE/CIRS, but there is no public CIRS API in this project; the warning covers that gap. |
| **Activity description** | Free text from nif.pt (`activity`) or the Racius `Atividade` section. Used only when no CAE maps. |
| **Sector** (`CategoryId`) | One of the twelve e-Fatura activities the extension knows: saúde, educação, habitação, lares, gerais, auto, moto, restauração, cabeleireiros, veterinária, passes, ginásios. |
| **Sector code** | The portal's `ambitoAquisicao` value: `C01`…`C11`, `C26`, `C99`. |
| **Primary** | The recommendation's first candidate. The default if the user does not choose. |
| **Alternative** | Another plausible sector, with its own confidence, reason and warning. |
| **Recommendation** | Primary plus alternatives, produced by `core/classify.ts`. |
| **Lookup source** | `nif.pt`, `racius`, `vies`, `name` or `none`. |
| **Cache** | A 30-day `chrome.storage.local` entry keyed by NIF. A total miss is not written. |
| **Choice** | The sector the user selected in the chip or the panel, kept per NIF across row re-renders. |

## The lookup chain

1. **nif.pt JSON API** — `https://www.nif.pt/?json=1&q=<nif>&key=<key>`. Free key requested from
   nif.pt. Returns the CAE and the activity text. Tried only when a key is configured.
2. **nif.pt public page** — `https://www.nif.pt/<nif>/`. No key. It links to the company's Racius
   profile, which gives the exact slug that a name-derived guess often misses.
3. **VIES** — `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/<nif>`. No key. It
   confirms the NIF and returns the registered name, but no CAE.
4. **Racius** — `https://www.racius.com/<slug>/`. Returns the CAE list and the `Atividade` text.
   The page must mention the NIF before its data is trusted.
5. **Name keywords** — last resort, at low confidence.

The worker caches a successful result for 30 days and serialises requests with a 350 ms gap. A
total miss is not cached.

## Classification order

`core/classify.ts` builds drafts and assigns a rank; the lowest rank is the primary, the rest are
alternatives, sorted by rank.

1. **Primary CAE maps** → primary at `high`.
2. **Primary CAE does not map** → **Outro (C99)** at `high`, with this reason: the registered main
   activity is not a special sector. This is rank 1, so it beats a secondary CAE.
3. **Secondary CAE maps** → alternative at `medium`, with `SECONDARY_WARNING`.
4. **No CAE maps** (no primary, no secondary) → the first two activity matches, at `medium`, with
   `ACTIVITY_WARNING`.
5. **No CAE and no activity match** → the first name match, at `low`, with `NAME_WARNING`.
6. **Primary CAE maps and there are ≥2 distinct sectors** → add **Outro** as an alternative at
   `high`, with `MULTI_REASON`.
7. **Food retail** (`4711`, `4712`, `472`) without a restaurant draft → add **Restauração e
   Alojamento** at `low`: a supermarket can sell ready meals.
8. **No CAE at all** → Outro is the primary at `medium` (or `low` when there is no other evidence).

The 23% health warning is applied to the primary and to every `saude` alternative.

## The portal's sector codes

| Code | Portal label | Extension sector |
| --- | --- | --- |
| `C01` | Manutenção e reparação de veículos automóveis | auto |
| `C02` | Manutenção e reparação de motociclos, de suas peças e acessórios | moto |
| `C03` | Alojamento, restauração e similares | restauração |
| `C04` | Atividades de salões de cabeleireiro e institutos de beleza | cabeleireiros |
| `C05` | Saúde | saúde |
| `C06` | Educação | educação |
| `C07` | Imóveis | habitação |
| `C08` | Lares | lares |
| `C09` | Atividades veterinárias | veterinária |
| `C10` | Aquisição de passes mensais ou de bilhetes para transportes públicos coletivos | passes |
| `C11` | Ginásios | ginásios |
| `C12` | Jornais e Revistas | Outro (fallback) |
| `C13` | Comércio a retalho de livros | educação (fallback) |
| `C14` | Atividades artísticas e literárias | Outro (fallback) |
| `C15` | Atividades dos museus e monumentos históricos | Outro (fallback) |
| `C26` | Educação (second code) | educação (fallback) |
| `C99` | Outros | Outro |

## Portal facts the UI relies on

- The pending list is a table whose header cells include `Emitente` and `Atividade de Realização
  da Aquisição`. DataTables adds the sort suffix, so the header is normalised before matching.
- The activity control is a Bootstrap button group:

  ```html
  <div class="btn-group selecaoSector radioBtnSelectPendencia" data-toggle="buttons-radio">
    <button type="button" value="C05" data-original-title="Saúde">
      <span class="iconListagem atf atf-saude" aria-label="Saúde"></span>
    </button>
    …
    <button type="button" value="C99" data-original-title="Outros">Outro</button>
  </div>
  ```

  Older markup uses a `<select name="ambitoAquisicao">`; both are supported. The `value` is
  authoritative; the label is only a fallback.
- The portal checks the chosen sector against the supplier's CAE/CIRS. A sector the supplier's
  registered activity does not support is refused with *“O emitente não tem atividade registada
  (CAE/CIRS) pertencente ao setor indicado.”*
- The save action is `resolverPendenciaAdquirente.action`. The extension never calls it. Clicking
  a sector button only changes the page's own selection state.
- Saúde at 23% IVA can require a medical prescription; the chip warns but cannot know.
- Habitação (rents, mortgage interest) and public care homes are often not in the pending list;
  the portal says they are handled later in the deduções à coleta page.

## Lookup facts worth keeping

- The nif.pt public page exposes the exact Racius slug in the `Informação Financeira` link (for
  example `/celeiro-do-calhariz-auto-servico-alimentar-lda/`). A slug built from the VIES name can
  miss words such as `do`; the link does not.
- Racius serves the activity text in ISO-8859-1 with HTML entities (`&ccedil;`, `&atilde;`,
  `&uacute;`). `infra/html.ts` decodes the Portuguese named entities before matching.
- VIES returns `isValid` and a `name`; `---` means the company hid its name.
- The nif.pt JSON API answers `{"message":"Key necessary…"}` when the key is absent or wrong; the
  chain notes that and continues.
- Taxis/TVDE (`4932`) and airlines (`511`) are deliberately not mapped to Passes Mensais.

## Deliberate omissions

- **No form submission and no save.** The extension may set a control; the user saves.
- **No auto-fill when alternatives exist.** Ambiguity is shown, not hidden.
- **No CIRS lookup.** There is no public API here; the warning is the honest substitute.
- **No separate manager page.** The suggestion belongs on the row it applies to.
- **No telemetry, proxy or account.**
- **No Firefox build.** The manifest is Chromium-only.
- **No automated signed-in DOM test.** It needs a portal session; the pure matching is unit-tested
  and the built extension is checked manually on one row.
