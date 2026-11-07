import { categoryById, matchCategoryText, normalizeText } from '../core/categories.ts';
import { recommend } from '../core/classify.ts';
import { confidenceLabel, sourceLabel } from '../core/labels.ts';
import { extractNif } from '../core/nif.ts';
import {
  categoryForSector,
  categoryFromControl,
  preferredSector,
} from '../core/sectors.ts';
import type {
  Alternative,
  CategoryId,
  Confidence,
  LookupSource,
  Recommendation,
  SupplierInfo,
} from '../core/types.ts';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from '../infra/browser.ts';
import type { UiStatus, UiStatusResponse, WorkerRequest, WorkerResponse } from '../infra/protocol.ts';
import { parseUiRequest, parseWorkerResponse } from '../infra/protocol.ts';

const SUGGESTED = 'data-efv-suggested';
const HINT_CLASS = 'efv-hint';
const PANEL_HOST_ID = 'efv-panel-host';

interface Grid {
  root: HTMLElement;
  rows: HTMLElement[];
  emitenteIndex: number;
  categoryIndex: number;
}

interface RowState {
  element: HTMLElement;
  nif: string | null;
  name: string;
  text: string;
  categoryCell: HTMLElement | null;
  hint: HTMLElement | null;
  renderedKey: string;
  applied: boolean;
  /** The user's pick when it differs from the primary suggestion. */
  chosen: CategoryId | null;
}

interface State {
  settings: Settings;
  grid: Grid | null;
  rows: RowState[];
  byElement: Map<HTMLElement, RowState>;
  knowledge: Map<string, SupplierInfo>;
  pending: Set<string>;
  /** The user's sector choice per NIF, kept across row re-renders. */
  choices: Map<string, CategoryId>;
  observer: MutationObserver | null;
}

const state: State = {
  settings: { ...DEFAULT_SETTINGS },
  grid: null,
  rows: [],
  byElement: new Map(),
  knowledge: new Map(),
  pending: new Set(),
  choices: new Map(),
  observer: null,
};

let panel: PanelApi | null = null;
let scanTimer: number | null = null;
let toastTimer: number | null = null;
let pageCards: PageCard[] = [];
const boundRows = new WeakSet<HTMLElement>();

function cellsOf(row: HTMLElement): HTMLElement[] {
  if (row instanceof HTMLTableRowElement) return [...row.cells];
  return [...row.querySelectorAll<HTMLElement>('[role="gridcell"], [role="cell"]')];
}

function headerTexts(table: HTMLTableElement): string[] {
  const rows = table.tHead === null ? [] : [...table.tHead.rows];
  if (rows.length === 0) {
    const first = table.rows[0];
    return first === undefined
      ? []
      : [...first.cells].map((cell) => normalizeText(cell.textContent ?? ''));
  }

  const width = Math.max(...rows.map((row) => row.cells.length));
  const headers: string[] = [];
  for (let index = 0; index < width; index += 1) {
    headers.push(
      rows
        .map((row) => normalizeText(row.cells[index]?.textContent ?? ''))
        .join(' ')
        .trim(),
    );
  }
  return headers;
}

function dataRows(table: HTMLTableElement): HTMLElement[] {
  const bodies = [...table.tBodies];
  const rows =
    bodies.length > 0
      ? bodies.flatMap((body) => [...body.rows])
      : [...table.rows].slice(1);

  return rows.filter((row) => {
    const cells = cellsOf(row);
    if (cells.length < 2) return false;
    if (cells.every((cell) => cell.tagName === 'TH')) return false;
    return (row.textContent ?? '').trim() !== '';
  });
}

/** Finds the pending-invoice table by its own headers, not by a brittle id. */
function findGrid(): Grid | null {
  let best: { grid: Grid; score: number } | null = null;

  for (const table of document.querySelectorAll<HTMLTableElement>('table')) {
    if (!document.documentElement.contains(table)) continue;
    const headers = headerTexts(table);
    const emitenteIndex = headers.findIndex((header) => header.includes('emitente'));
    const categoryIndex = headers.findIndex((header) =>
      /atividade.*aquisicao/.test(header),
    );
    if (emitenteIndex < 0 && categoryIndex < 0) continue;

    const rows = dataRows(table);
    if (rows.length === 0) continue;

    const score =
      (emitenteIndex >= 0 ? 2 : 0) +
      (categoryIndex >= 0 ? 3 : 0) +
      Math.min(rows.length, 10) / 10;
    if (best === null || score > best.score) {
      best = { grid: { root: table, rows, emitenteIndex, categoryIndex }, score };
    }
  }
  if (best !== null) return best.grid;

  const headers = [...document.querySelectorAll<HTMLElement>('[role="columnheader"]')].map(
    (header) => normalizeText(header.textContent ?? ''),
  );
  const emitenteIndex = headers.findIndex((header) => header.includes('emitente'));
  const categoryIndex = headers.findIndex((header) => /atividade.*aquisicao/.test(header));
  if (emitenteIndex < 0 && categoryIndex < 0) return null;

  const rows = [...document.querySelectorAll<HTMLElement>('[role="row"]')].filter(
    (row) => row.querySelector('[role="gridcell"], [role="cell"]') !== null,
  );
  if (rows.length === 0) return null;
  return { root: document.body, rows, emitenteIndex, categoryIndex };
}

function supplierName(raw: string, nif: string | null): string {
  let value = raw;
  if (nif !== null) value = value.split(nif).join(' ');
  value = value.replace(/\bNIF\b\s*[:.]?/gi, ' ');
  value = value.replace(/\(\s*\)/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value.replace(/^[\s\-–—:;,.]+/, '').replace(/[\s\-–—:;,.]+$/, '').trim();
}

function findCategoryCell(cells: HTMLElement[]): HTMLElement | null {
  for (const cell of cells) {
    if (
      cell.querySelector(
        '[data-toggle="buttons-radio"], .selecaoSector, .radioBtnSelectPendencia',
      ) !== null
    ) {
      return cell;
    }
    const controls = [...cell.querySelectorAll<HTMLElement>(CATEGORY_CONTROL)];
    if (controls.some((control) => categoryForSector(controlValue(control)) !== null)) return cell;
  }
  for (const cell of cells) {
    for (const select of cell.querySelectorAll('select')) {
      if ([...select.options].some((option) => optionCategory(option) !== null)) return cell;
    }
  }
  for (const cell of cells) {
    if (cell.querySelector('select, [role="combobox"]') !== null) return cell;
  }
  return null;
}

interface ResolvedRow {
  nif: string | null;
  name: string;
  text: string;
  categoryCell: HTMLElement | null;
}

function resolveRow(element: HTMLElement, grid: Grid): ResolvedRow {
  const cells = cellsOf(element);
  let categoryCell =
    grid.categoryIndex >= 0 ? (cells[grid.categoryIndex] ?? null) : null;
  let emitenteCell = grid.emitenteIndex >= 0 ? (cells[grid.emitenteIndex] ?? null) : null;

  const emitenteText = emitenteCell?.textContent ?? '';
  const emitenteAttrs =
    emitenteCell === null
      ? ''
      : [
          emitenteCell.getAttribute('title'),
          emitenteCell.getAttribute('data-nif'),
          emitenteCell.getAttribute('aria-label'),
        ]
          .filter((value): value is string => value !== null && value !== '')
          .join(' ');

  let nif = emitenteCell === null ? null : extractNif(`${emitenteText} ${emitenteAttrs}`);
  if (nif === null) {
    for (const cell of cells) {
      if (cell === categoryCell) continue;
      const candidate = extractNif(cell.textContent ?? '');
      if (candidate !== null) {
        nif = candidate;
        emitenteCell = cell;
        break;
      }
    }
  }

  if (categoryCell === null) categoryCell = findCategoryCell(cells);
  if (nif === null) nif = extractNif(element.textContent ?? '');

  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    nif,
    name: supplierName(emitenteCell?.textContent ?? emitenteText, nif),
    text,
    categoryCell,
  };
}

function recommendationFor(row: RowState): Recommendation | null {
  if (row.nif === null) return null;
  const info = state.knowledge.get(row.nif);
  if (info === undefined) return null;
  return recommend(info, row.name, row.text);
}

function activeCategory(row: RowState): CategoryId | null {
  const rec = recommendationFor(row);
  if (rec === null) return null;
  return row.chosen ?? rec.category;
}

function candidateFor(row: RowState, category: CategoryId): Alternative | null {
  const rec = recommendationFor(row);
  if (rec === null) return null;
  if (rec.category === category) {
    return {
      category,
      confidence: rec.confidence,
      reason: rec.reason,
      warning: rec.warning,
    };
  }
  return rec.alternatives.find((alternative) => alternative.category === category) ?? null;
}

function chooseCategory(row: RowState, category: CategoryId): void {
  const rec = recommendationFor(row);
  if (rec === null) return;
  row.chosen = category === rec.category ? null : category;
  if (row.nif !== null) {
    if (row.chosen === null) state.choices.delete(row.nif);
    else state.choices.set(row.nif, row.chosen);
  }
  row.applied = false;
  row.renderedKey = '';
  renderHint(row);
  updatePanel();
}

function removeHint(row: RowState, clearKey = true): void {
  row.hint?.remove();
  row.hint = null;
  if (clearKey) row.renderedKey = '';
}

function renderHint(row: RowState): void {
  const cell = row.categoryCell;
  if (cell === null) return;

  const rec = recommendationFor(row);
  const active = activeCategory(row);
  const candidate = active === null ? null : candidateFor(row, active);
  const key =
    rec === null || active === null || candidate === null
      ? `load:${row.nif ?? 'none'}`
      : `${active}|${candidate.confidence}|${candidate.warning ?? ''}|${rec.alternatives
          .map((alternative) => alternative.category)
          .join(',')}|${row.applied ? 1 : 0}|${row.chosen ?? ''}|${rec.caes.join(',')}`;

  if (row.renderedKey === key && row.hint !== null && row.hint.parentElement === cell) {
    // The row may have re-rendered its controls; the ring has to be reapplied.
    highlight(row);
    return;
  }
  row.renderedKey = key;

  removeHint(row, false);
  const hint = document.createElement('div');
  hint.className = `${HINT_CLASS} ${HINT_CLASS}--loading`;

  if (rec === null || active === null || candidate === null) {
    hint.textContent =
      row.nif === null ? 'Sem NIF legível nesta linha' : `A consultar NIF ${row.nif}…`;
  } else {
    hint.classList.remove(`${HINT_CLASS}--loading`);
    hint.classList.add(`${HINT_CLASS}--${candidate.confidence}`);

    const dot = document.createElement('span');
    dot.className = 'efv-dot';
    dot.title = confidenceLabel(candidate.confidence);

    const badge = document.createElement('span');
    badge.className = 'efv-badge';
    badge.textContent = categoryById(active).label;

    const sector = preferredSector(active);
    const meta = document.createElement('span');
    meta.className = 'efv-meta';
    meta.textContent = `${sector} · ${candidate.reason}`;
    meta.title = [
      `Código e-Fatura: ${sector}`,
      candidate.reason,
      rec.caes.length > 0 ? `CAE: ${rec.caes.join(', ')}` : null,
      candidate.warning,
    ]
      .filter((line): line is string => typeof line === 'string' && line !== '')
      .join('\n');

    hint.append(dot, badge, meta);

    if (candidate.warning !== null) {
      const warn = document.createElement('span');
      warn.className = 'efv-warn';
      warn.textContent = '⚠';
      warn.title = candidate.warning;
      hint.append(warn);
    }

    if (rec.alternatives.length > 0) {
      const alts = document.createElement('div');
      alts.className = 'efv-alts';

      const caption = document.createElement('span');
      caption.className = 'efv-alts-caption';
      caption.textContent = 'Escolher:';
      alts.append(caption);

      const choices = [
        {
          category: rec.category,
          confidence: rec.confidence,
          reason: rec.reason,
          warning: rec.warning,
          primary: true,
        },
        ...rec.alternatives.map((alternative) => ({ ...alternative, primary: false })),
      ].slice(0, 5);

      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `efv-alt${choice.category === active ? ' efv-alt--active' : ''}`;
        button.textContent = `${choice.primary ? '★ ' : ''}${categoryById(choice.category).label} (${preferredSector(choice.category)})`;
        button.title = [
          choice.reason,
          choice.warning,
          'Escolher esta categoria; depois clique em Aplicar.',
        ]
          .filter((line): line is string => typeof line === 'string' && line !== '')
          .join('\n');
        button.disabled = choice.category === active;
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          chooseCategory(row, choice.category);
        });
        alts.append(button);
      }
      hint.append(alts);
    }

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'efv-apply';
    apply.textContent = row.applied ? 'Preenchido' : 'Aplicar';
    apply.disabled = row.applied;
    apply.title = 'Preencher a atividade desta linha com a sugestão';
    apply.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyRecommendation(row);
    });
    hint.append(apply);

    hint.addEventListener('click', (event) => {
      if (event.target === apply) return;
      focusRow(row);
    });
  }

  hint.dataset['nif'] = row.nif ?? '';
  cell.append(hint);
  row.hint = hint;
  highlight(row);
}

function clearHighlights(root: HTMLElement): void {
  for (const node of root.querySelectorAll<HTMLElement>(`[${SUGGESTED}]`)) {
    node.removeAttribute(SUGGESTED);
    node.classList.remove('efv-suggested');
  }
  root.classList.remove('efv-cell-suggested');
}

function mark(node: Element): void {
  node.setAttribute(SUGGESTED, '1');
  node.classList.add('efv-suggested');
}

function inputLabel(input: HTMLInputElement): string {
  const label = input.labels?.[0];
  return (label?.textContent ?? input.getAttribute('aria-label') ?? input.value ?? '').trim();
}

/** The portal's option value (`C05`) is stronger evidence than its label. */
function optionCategory(option: HTMLOptionElement): CategoryId | null {
  return categoryFromControl(option.value, option.textContent ?? '');
}

function findOptionFor(
  select: HTMLSelectElement,
  category: CategoryId,
): HTMLOptionElement | null {
  const preferred = preferredSector(category).toUpperCase();
  const options = [...select.options];
  const exact = options.find((option) => option.value.trim().toUpperCase() === preferred);
  if (exact !== undefined) return exact;
  return options.find((option) => optionCategory(option) === category) ?? null;
}

const CATEGORY_CONTROL =
  'button[value], input[value], a[value], [role="button"][value], [role="radio"][value]';

function controlValue(control: Element): string {
  return (control.getAttribute('value') ?? '').trim();
}

function controlCategory(control: Element): CategoryId | null {
  return categoryFromControl(controlValue(control), elementText(control));
}

/** Finds the exact button for the sector, preferring the portal's own code. */
function findControlFor(root: ParentNode, category: CategoryId): HTMLElement | null {
  const preferred = preferredSector(category).toUpperCase();
  const controls = [...root.querySelectorAll<HTMLElement>(CATEGORY_CONTROL)].filter(
    (control) => !(control instanceof HTMLInputElement && control.type === 'hidden'),
  );
  const exact = controls.find(
    (control) => controlValue(control).toUpperCase() === preferred,
  );
  if (exact !== undefined) return exact;
  return controls.find((control) => controlCategory(control) === category) ?? null;
}

function elementText(node: Element): string {
  if (node instanceof HTMLImageElement) return (node.alt || node.title || '').trim();

  const candidates = [
    node.getAttribute('aria-label'),
    node.getAttribute('data-original-title'),
    node.getAttribute('title'),
    node.textContent,
  ];
  for (const candidate of candidates) {
    const value = (candidate ?? '').replace(/\s+/g, ' ').trim();
    if (value.length >= 3 && value.length <= 120) return value;
  }

  // The icon buttons carry the label on a child span, not on the button.
  const icon = node.querySelector('[aria-label], [data-original-title], [title]');
  if (icon !== null) {
    for (const attribute of ['aria-label', 'data-original-title', 'title']) {
      const value = (icon.getAttribute(attribute) ?? '').replace(/\s+/g, ' ').trim();
      if (value.length >= 3 && value.length <= 120) return value;
    }
  }
  return '';
}

function highlight(row: RowState): void {
  const cell = row.categoryCell;
  if (cell === null) return;

  const category = activeCategory(row);
  clearHighlights(cell);
  if (category === null) return;

  let hits = 0;

  for (const select of cell.querySelectorAll('select')) {
    const option = findOptionFor(select, category);
    if (option !== null) {
      mark(option);
      mark(select);
      hits += 1;
    }
  }

  const control = findControlFor(cell, category);
  if (control !== null) {
    mark(control);
    hits += 1;
  }

  for (const input of cell.querySelectorAll<HTMLInputElement>(
    'input[type="radio"], input[type="checkbox"]',
  )) {
    if (matchCategoryText(inputLabel(input)) === category) {
      mark(input);
      const label = input.labels?.[0];
      if (label !== undefined) mark(label);
      hits += 1;
    }
  }

  for (const candidate of cell.querySelectorAll<HTMLElement>(
    'a, button, label, [role="button"], [role="option"], img',
  )) {
    if (candidate.hasAttribute('value')) continue;
    if (candidate.closest(`.${HINT_CLASS}`) !== null) continue;
    const text = elementText(candidate);
    if (text !== '' && matchCategoryText(text) === category) {
      mark(candidate);
      hits += 1;
    }
  }

  if (hits === 0) cell.classList.add('efv-cell-suggested');
}

function setControl(cell: HTMLElement, category: CategoryId): boolean {
  for (const select of cell.querySelectorAll('select')) {
    const option = findOptionFor(select, category);
    if (option !== null) {
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
  }

  const control = findControlFor(cell, category);
  if (control !== null) {
    if (control instanceof HTMLButtonElement && (control.type === 'submit' || control.disabled)) {
      return false;
    }
    if (control instanceof HTMLInputElement && control.type === 'hidden') return false;
    if (control instanceof HTMLInputElement && control.checked) return true;
    if (
      control.classList.contains('active') ||
      control.getAttribute('aria-pressed') === 'true'
    ) {
      return true;
    }
    control.click();
    return true;
  }

  for (const input of cell.querySelectorAll<HTMLInputElement>(
    'input[type="radio"], input[type="checkbox"]',
  )) {
    if (matchCategoryText(inputLabel(input)) === category) {
      input.click();
      return true;
    }
  }

  for (const candidate of cell.querySelectorAll<HTMLElement>(
    'a, button, label, [role="button"], [role="option"]',
  )) {
    if (candidate.hasAttribute('value')) continue;
    if (candidate.closest(`.${HINT_CLASS}`) !== null) continue;
    if (candidate instanceof HTMLButtonElement && candidate.type === 'submit') continue;
    const text = elementText(candidate);
    if (text !== '' && matchCategoryText(text) === category) {
      candidate.click();
      return true;
    }
  }

  return false;
}

function applyRecommendation(row: RowState, quiet = false): void {
  const category = activeCategory(row);
  const candidate = category === null ? null : candidateFor(row, category);
  const cell = row.categoryCell;
  if (category === null || candidate === null || cell === null) {
    if (!quiet) toast('Sem sugestão para esta linha.');
    return;
  }

  if (!setControl(cell, category)) {
    if (!quiet) {
      toast(
        `Sem controlo de categoria nesta linha. Escolha "${categoryById(category).label}" manualmente.`,
      );
    }
    return;
  }

  row.applied = true;
  row.renderedKey = '';
  renderHint(row);
  updatePanel();
  if (!quiet) {
    flash(row);
    toast(`Atividade "${categoryById(category).label}" preenchida. Confirme e grave.`);
  }
}

function flash(row: RowState): void {
  row.element.classList.remove('efv-flash');
  void row.element.offsetWidth;
  row.element.classList.add('efv-flash');
  window.setTimeout(() => row.element.classList.remove('efv-flash'), 1300);
}

function focusRow(row: RowState): void {
  row.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flash(row);
  highlightPageCards(activeCategory(row));
}

function setActive(row: RowState): void {
  highlightPageCards(activeCategory(row));
}

function bindActive(row: RowState): void {
  if (boundRows.has(row.element)) return;
  boundRows.add(row.element);
  row.element.addEventListener('mouseenter', () => setActive(row));
  row.element.addEventListener('focusin', () => setActive(row));
  row.element.addEventListener('click', () => setActive(row));
}

interface PageCard {
  host: HTMLElement;
  category: CategoryId;
}

/** Cards outside the table (the icons at the top of the page) are matched once per scan. */
function collectPageCards(root: HTMLElement): void {
  pageCards = [];
  const seen = new Set<HTMLElement>();

  for (const node of document.querySelectorAll<HTMLElement>(
    'a, button, label, img, [role="button"], [class*="card"], [class*="tile"]',
  )) {
    if (root.contains(node)) continue;
    if (node.closest(`#${PANEL_HOST_ID}`) !== null) continue;

    const host =
      node.closest<HTMLElement>('a, button, label, [role="button"], [class*="card"], [class*="tile"]') ??
      node;
    if (seen.has(host)) continue;
    if ((host.textContent ?? '').trim().length > 120) continue;

    const text = elementText(host);
    if (text === '') continue;
    const category = matchCategoryText(text);
    if (category === null) continue;

    seen.add(host);
    pageCards.push({ host, category });
  }
}

function highlightPageCards(category: CategoryId | null): void {
  for (const card of pageCards) {
    card.host.classList.toggle(
      'efv-page-card',
      category !== null && card.category === category,
    );
  }
}

function toast(message: string): void {
  let node = document.getElementById('efv-toast');
  if (node === null) {
    node = document.createElement('div');
    node.id = 'efv-toast';
    node.className = 'efv-toast';
    document.documentElement.append(node);
  }
  node.textContent = message;
  node.classList.add('efv-toast--show');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node?.classList.remove('efv-toast--show');
  }, 3600);
}

function usableInfo(raw: unknown, nif: string, name: string): SupplierInfo {
  if (typeof raw !== 'object' || raw === null) {
    return { nif, name: name === '' ? null : name, cae: null, caes: [], activity: null, source: 'none', note: null };
  }
  const fields = raw as Record<string, unknown>;
  const caes = Array.isArray(fields['caes'])
    ? fields['caes'].filter((item): item is string => typeof item === 'string')
    : [];
  const source = fields['source'];
  return {
    nif,
    name: typeof fields['name'] === 'string' ? fields['name'] : null,
    cae: typeof fields['cae'] === 'string' ? fields['cae'] : (caes[0] ?? null),
    caes,
    activity: typeof fields['activity'] === 'string' ? fields['activity'] : null,
    source:
      source === 'nif.pt' || source === 'racius' || source === 'vies' || source === 'name'
        ? source
        : 'none',
    note: typeof fields['note'] === 'string' ? fields['note'] : null,
  };
}

function sendWorker(request: WorkerRequest): Promise<WorkerResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: unknown) => {
      const error = chrome.runtime.lastError;
      if (error !== undefined) {
        resolve(null);
        return;
      }
      resolve(parseWorkerResponse(response));
    });
  });
}

async function requestLookup(nif: string, name: string, refresh: boolean): Promise<void> {
  const response = await sendWorker({ type: 'lookup', nif, name, refresh });
  const info =
    response !== null && response.ok && response.kind === 'lookup'
      ? usableInfo(response.info, nif, name)
      : usableInfo(
          null,
          nif,
          name,
        );

  if (response === null || !response.ok) {
    info.note = response !== null && !response.ok ? response.error : 'sem resposta do serviço';
  }

  state.knowledge.set(nif, info);

  for (const row of state.rows) {
    if (row.nif !== nif) continue;
    renderHint(row);
    const rec = recommendationFor(row);
    if (
      state.settings.autoApply &&
      !row.applied &&
      rec !== null &&
      rec.alternatives.length === 0 &&
      rec.confidence === 'high'
    ) {
      applyRecommendation(row, true);
    }
  }
  updatePanel();
}

function ensureLookup(row: RowState, refresh = false): void {
  const nif = row.nif;
  if (nif === null) return;
  if (!refresh && state.knowledge.has(nif)) {
    renderHint(row);
    return;
  }
  if (state.pending.has(nif)) return;

  state.pending.add(nif);
  void requestLookup(nif, row.name, refresh).finally(() => state.pending.delete(nif));
}

function scan(force = false): void {
  if (force) {
    for (const row of state.rows) row.renderedKey = '';
  }

  const grid = findGrid();
  if (grid === null) {
    state.grid = null;
    for (const row of state.rows) removeHint(row);
    state.rows = [];
    state.byElement.clear();
    pageCards = [];
    highlightPageCards(null);
    updatePanel();
    return;
  }

  state.grid = grid;
  collectPageCards(grid.root);

  const next: RowState[] = [];
  for (const element of grid.rows) {
    const resolved = resolveRow(element, grid);
    let row = state.byElement.get(element);
    if (row === undefined) {
      row = {
        element,
        ...resolved,
        hint: null,
        renderedKey: '',
        applied: false,
        chosen:
          resolved.nif === null ? null : (state.choices.get(resolved.nif) ?? null),
      };
    } else {
      if (row.nif !== resolved.nif) {
        row.chosen =
          resolved.nif === null ? null : (state.choices.get(resolved.nif) ?? null);
        row.applied = false;
      }
      row.nif = resolved.nif;
      row.name = resolved.name;
      row.text = resolved.text;
      row.categoryCell = resolved.categoryCell;
      row.element = element;
    }

    next.push(row);
    state.byElement.set(element, row);
    bindActive(row);

    if (row.nif !== null && !state.knowledge.has(row.nif) && !state.pending.has(row.nif)) {
      void ensureLookup(row);
    }
    renderHint(row);
  }

  const alive = new Set(next.map((row) => row.element));
  for (const [element, row] of state.byElement) {
    if (alive.has(element)) continue;
    removeHint(row);
    state.byElement.delete(element);
  }

  state.rows = next;
  updatePanel();
}

function refreshAll(): void {
  state.knowledge.clear();
  state.pending.clear();
  state.choices.clear();
  for (const row of state.rows) {
    row.applied = false;
    row.chosen = null;
    row.renderedKey = '';
    renderHint(row);
    if (row.nif !== null) void ensureLookup(row, true);
  }
  updatePanel();
}

function scheduleScan(): void {
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scan();
  }, 350);
}

function isOwnNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.closest(`.${HINT_CLASS}, #efv-toast, #${PANEL_HOST_ID}`) !== null;
}

function start(): void {
  if (state.observer !== null) return;
  state.observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (nodes.length === 0) continue;
      if (nodes.every(isOwnNode)) continue;
      scheduleScan();
      return;
    }
  });
  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

function stop(): void {
  state.observer?.disconnect();
  state.observer = null;
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  for (const row of state.rows) removeHint(row);
  state.rows = [];
  state.byElement.clear();
  state.choices.clear();
  state.grid = null;
  pageCards = [];
  highlightPageCards(null);
  panel?.hide();
}

function currentStatus(): UiStatus {
  const rows = state.rows;
  const looked = rows.filter((row) => row.nif !== null && state.knowledge.has(row.nif)).length;
  const pending = rows.filter((row) => row.nif !== null && !state.knowledge.has(row.nif)).length;
  const unknown = rows.filter((row) => recommendationFor(row)?.confidence === 'low').length;

  return {
    enabled: state.settings.enabled,
    found: state.grid !== null,
    rows: rows.length,
    looked,
    pending,
    unknown,
    panelOpen: panel?.isOpen() ?? false,
  };
}

function statusText(): string {
  if (state.grid === null) return 'Tabela de pendências não encontrada.';
  const total = state.rows.length;
  const looked = state.rows.filter((row) => row.nif !== null && state.knowledge.has(row.nif)).length;
  const pending = state.rows.filter((row) => row.nif !== null && !state.knowledge.has(row.nif)).length;
  const unknown = state.rows.filter((row) => recommendationFor(row)?.confidence === 'low').length;

  const parts = [`${total} linha${total === 1 ? '' : 's'}`, `${looked} consultada${looked === 1 ? '' : 's'}`];
  if (pending > 0) parts.push(`${pending} em curso`);
  if (unknown > 0) parts.push(`${unknown} por confirmar`);
  return parts.join(' · ');
}

interface PanelChoice {
  category: CategoryId;
  label: string;
  sector: string;
  reason: string;
  warning: string | null;
  active: boolean;
  onChoose: () => void;
}

interface PanelRow {
  nif: string;
  name: string;
  category: string;
  sector: string;
  confidence: Confidence;
  source: LookupSource;
  detail: string;
  warning: string | null;
  applied: boolean;
  choices: PanelChoice[];
  onFocus: () => void;
  onApply: () => void;
}

function updatePanel(): void {
  if (panel === null) return;

  const rows: PanelRow[] = state.rows.map((row) => {
    const rec = recommendationFor(row);
    const active = rec === null ? null : (row.chosen ?? rec.category);
    const candidate = rec !== null && active !== null ? candidateFor(row, active) : null;

    const choices: PanelChoice[] =
      rec === null
        ? []
        : [
            {
              category: rec.category,
              label: categoryById(rec.category).label,
              sector: preferredSector(rec.category),
              reason: rec.reason,
              warning: rec.warning,
              active: active === rec.category,
              onChoose: () => chooseCategory(row, rec.category),
            },
            ...rec.alternatives.map((alternative) => ({
              category: alternative.category,
              label: categoryById(alternative.category).label,
              sector: preferredSector(alternative.category),
              reason: alternative.reason,
              warning: alternative.warning,
              active: active === alternative.category,
              onChoose: () => chooseCategory(row, alternative.category),
            })),
          ];

    return {
      nif: row.nif ?? '',
      name: row.name !== '' ? row.name : row.nif !== null ? `NIF ${row.nif}` : 'Emitente sem NIF',
      category: active === null ? '—' : categoryById(active).label,
      sector: active === null ? '—' : preferredSector(active),
      confidence: candidate?.confidence ?? 'low',
      source: rec?.source ?? 'none',
      detail: candidate?.reason ?? (row.nif === null ? 'sem NIF legível' : 'a consultar…'),
      warning: candidate?.warning ?? null,
      applied: row.applied,
      choices,
      onFocus: () => focusRow(row),
      onApply: () => applyRecommendation(row),
    };
  });

  panel.setRows(rows, statusText());
}

interface PanelApi {
  host: HTMLElement;
  setRows: (rows: PanelRow[], status: string) => void;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  isOpen: () => boolean;
  setVisible: (visible: boolean) => void;
}

const PANEL_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.wrap {
  position: fixed; right: 16px; bottom: 16px; width: 360px; max-width: calc(100vw - 32px);
  background: #0b1220; color: #e2e8f0; border: 1px solid #1e293b; border-radius: 14px;
  box-shadow: 0 18px 48px rgba(2, 6, 23, .45), 0 2px 8px rgba(2, 6, 23, .35);
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden; z-index: 2147483646; letter-spacing: .01em;
}
.wrap.collapsed .list, .wrap.collapsed footer { display: none; }
header { display: flex; align-items: flex-start; gap: 8px; padding: 12px 12px 10px;
  background: linear-gradient(180deg, #111c33, #0b1220); border-bottom: 1px solid #1e293b; }
.head-text { flex: 1; min-width: 0; }
.title { font-weight: 700; font-size: 13px; color: #f8fafc; }
.status { margin-top: 2px; font-size: 11.5px; color: #94a3b8; }
.actions { display: flex; gap: 4px; flex: none; }
.actions button, footer button {
  appearance: none; border: 1px solid #334155; background: #172033; color: #cbd5e1;
  border-radius: 7px; padding: 3px 8px; font: inherit; font-size: 11.5px; cursor: pointer;
}
.actions button:hover, footer button:hover { background: #1e293b; color: #f8fafc; }
.list { max-height: min(52vh, 460px); overflow: auto; padding: 2px; scrollbar-width: thin; }
.empty { margin: 14px 10px; color: #94a3b8; font-size: 12px; line-height: 1.5; }
.item { border: 1px solid #1e293b; border-radius: 10px; padding: 8px; margin: 6px; background: #0f172a; }
.item--warn { border-color: #713f12; background: #1c1508; }
.top { display: flex; align-items: flex-start; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; }
.dot--high { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.16); }
.dot--medium { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,.16); }
.dot--low { background: #94a3b8; }
.go { flex: 1; min-width: 0; text-align: left; appearance: none; border: 0; background: transparent;
  color: inherit; font: inherit; cursor: pointer; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.go:hover .name { color: #5eead4; }
.name { font-weight: 600; font-size: 12.5px; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detail { font-size: 11.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { font-size: 10.5px; color: #64748b; }
.cat { flex: none; max-width: 42%; font-size: 11px; font-weight: 700; color: #5eead4;
  background: rgba(20,184,166,.12); border: 1px solid rgba(20,184,166,.32); border-radius: 999px;
  padding: 2px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.choices { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.choice { appearance: none; border: 1px solid #334155; background: #111c33; color: #cbd5e1;
  border-radius: 999px; padding: 2px 7px; font: inherit; font-size: 10.5px; cursor: pointer; }
.choice:hover { border-color: #14b8a6; }
.choice:disabled { cursor: default; }
.choice--active { border-color: #14b8a6; background: rgba(20,184,166,.18); color: #5eead4;
  font-weight: 700; }
.bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
.warn { font-size: 10.5px; color: #fbbf24; line-height: 1.35; }
.apply { appearance: none; border: 1px solid #0d9488; background: #0f766e; color: #f0fdfa;
  border-radius: 7px; padding: 3px 9px; font: inherit; font-size: 11.5px; font-weight: 600;
  cursor: pointer; flex: none; }
.apply:hover { background: #115e59; }
.apply:disabled { opacity: .55; cursor: default; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 12px; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; }
`;

function panelButton(label: string, title: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.title = title;
  return node;
}

function panelItem(row: PanelRow): HTMLElement {
  const item = document.createElement('div');
  item.className = 'item';
  if (row.warning !== null) item.classList.add('item--warn');

  const dot = document.createElement('span');
  dot.className = `dot dot--${row.confidence}`;
  dot.title = confidenceLabel(row.confidence);

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'go';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = row.name;

  const detail = document.createElement('span');
  detail.className = 'detail';
  detail.textContent = row.detail;

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = [
    row.nif !== '' ? `NIF ${row.nif}` : null,
    `fonte: ${sourceLabel(row.source)}`,
    row.sector === '—' ? null : row.sector,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  go.append(name, detail, meta);
  go.addEventListener('click', row.onFocus);

  const badge = document.createElement('span');
  badge.className = 'cat';
  badge.textContent = row.category;

  const top = document.createElement('div');
  top.className = 'top';
  top.append(dot, go, badge);

  const choices = document.createElement('div');
  choices.className = 'choices';
  for (const choice of row.choices) {
    const button = panelButton(
      `${choice.active ? '✓ ' : ''}${choice.label} (${choice.sector})`,
      [choice.reason, choice.warning, 'Escolher esta categoria; depois Aplicar.']
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join('\n'),
    );
    button.className = `choice${choice.active ? ' choice--active' : ''}`;
    button.disabled = choice.active;
    button.addEventListener('click', choice.onChoose);
    choices.append(button);
  }

  const bottom = document.createElement('div');
  bottom.className = 'bottom';

  if (row.warning !== null) {
    const warn = document.createElement('span');
    warn.className = 'warn';
    warn.textContent = `⚠ ${row.warning}`;
    bottom.append(warn);
  }

  const apply = panelButton(row.applied ? 'Preenchido' : 'Aplicar', 'Preencher a atividade desta linha');
  apply.className = 'apply';
  apply.disabled = row.applied;
  apply.addEventListener('click', row.onApply);
  bottom.append(apply);

  item.append(top);
  if (row.choices.length > 1) item.append(choices);
  item.append(bottom);
  return item;
}

function createPanel(): PanelApi {
  const host = document.createElement('div');
  host.id = PANEL_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = PANEL_CSS;

  const wrap = document.createElement('section');
  wrap.className = 'wrap';

  const header = document.createElement('header');
  const headText = document.createElement('div');
  headText.className = 'head-text';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'e-Fatura · atividades';

  const status = document.createElement('div');
  status.className = 'status';
  status.textContent = 'A procurar a tabela…';
  headText.append(title, status);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const rescan = panelButton('⟳', 'Voltar a procurar a tabela');
  const collapse = panelButton('–', 'Recolher');
  actions.append(rescan, collapse);
  header.append(headText, actions);

  const list = document.createElement('div');
  list.className = 'list';

  const footer = document.createElement('footer');
  const note = document.createElement('span');
  note.textContent = 'Sugestões — confirme antes de gravar.';
  const options = panelButton('Opções', 'Abrir as opções da extensão');
  footer.append(note, options);

  wrap.append(header, list, footer);
  shadow.append(style, wrap);
  document.documentElement.append(host);

  const api: PanelApi = {
    host,
    setRows(rows, text) {
      status.textContent = text;
      const scroll = list.scrollTop;
      list.replaceChildren();

      if (rows.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent =
          state.grid === null
            ? 'Tabela de pendências não encontrada. Abra «Resolver pendências» e tente «⟳».'
            : 'Sem linhas para classificar.';
        list.append(empty);
      } else {
        for (const row of rows) list.append(panelItem(row));
      }
      list.scrollTop = scroll;
    },
    toggle() {
      if (host.style.display === 'none') {
        api.show();
        return;
      }
      wrap.classList.toggle('collapsed');
    },
    show() {
      host.style.display = '';
      wrap.classList.remove('collapsed');
    },
    hide() {
      host.style.display = 'none';
    },
    isOpen() {
      return host.style.display !== 'none' && !wrap.classList.contains('collapsed');
    },
    setVisible(visible) {
      if (visible) api.show();
      else api.hide();
    },
  };

  rescan.addEventListener('click', () => {
    if (state.settings.enabled) scan(true);
  });
  collapse.addEventListener('click', () => api.toggle());
  options.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'open-options' }, () => {
      void chrome.runtime.lastError;
    });
  });

  return api;
}

async function init(): Promise<void> {
  state.settings = await loadSettings();
  panel = createPanel();
  panel.setVisible(state.settings.showPanel);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !('settings' in changes)) return;
    void loadSettings().then((next) => {
      const wasEnabled = state.settings.enabled;
      state.settings = next;
      panel?.setVisible(next.showPanel);
      if (!next.enabled) stop();
      else if (!wasEnabled) start();
      updatePanel();
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = parseUiRequest(message);
    if (request === null) return false;

    switch (request.type) {
      case 'ui-status': {
        const response: UiStatusResponse = { ok: true, status: currentStatus() };
        sendResponse(response);
        return false;
      }
      case 'ui-rescan': {
        if (state.settings.enabled) scan(true);
        const response: UiStatusResponse = { ok: true, status: currentStatus() };
        sendResponse(response);
        return false;
      }
      case 'ui-toggle-panel': {
        if (panel !== null) {
          if (panel.isOpen()) panel.hide();
          else panel.show();
        }
        const response: UiStatusResponse = { ok: true, status: currentStatus() };
        sendResponse(response);
        return false;
      }
      case 'ui-refresh': {
        if (state.settings.enabled) refreshAll();
        const response: UiStatusResponse = { ok: true, status: currentStatus() };
        sendResponse(response);
        return false;
      }
    }
  });

  if (state.settings.enabled) start();
}

void init();
