import { categoryById } from '../core/categories.ts';
import { recommend } from '../core/classify.ts';
import { confidenceLabel, sourceLabel } from '../core/labels.ts';
import { isValidNif, normalizeNif } from '../core/nif.ts';
import { preferredSector } from '../core/sectors.ts';
import type { SupplierInfo } from '../core/types.ts';
import { loadSettings, saveSettings } from '../infra/browser.ts';
import type { WorkerRequest, WorkerResponse } from '../infra/protocol.ts';
import { parseWorkerResponse } from '../infra/protocol.ts';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}

const enabled = byId<HTMLInputElement>('enabled');
const showPanel = byId<HTMLInputElement>('showPanel');
const autoApply = byId<HTMLInputElement>('autoApply');
const nifptKey = byId<HTMLInputElement>('nifptKey');
const saveButton = byId<HTMLButtonElement>('save');
const saveStatus = byId<HTMLElement>('saveStatus');

const testNif = byId<HTMLInputElement>('testNif');
const testName = byId<HTMLInputElement>('testName');
const testButton = byId<HTMLButtonElement>('test');
const testStatus = byId<HTMLElement>('testStatus');
const testResult = byId<HTMLElement>('testResult');

const clearButton = byId<HTMLButtonElement>('clearCache');
const cacheStatus = byId<HTMLElement>('cacheStatus');

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

function addRow(list: HTMLElement, label: string, value: string): void {
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  list.append(term, description);
}

function renderResult(info: SupplierInfo, fallbackName: string): void {
  const rec = recommend(info, info.name ?? fallbackName, '');
  const list = document.createElement('dl');

  addRow(list, 'Nome', info.name ?? '—');
  addRow(list, 'NIF', info.nif);
  addRow(list, 'CAE', info.caes.length > 0 ? info.caes.join(', ') : '—');
  addRow(list, 'Atividade', info.activity ?? '—');
  addRow(list, 'Fonte', sourceLabel(info.source));
  addRow(list, 'Sugestão', categoryById(rec.category).label);
  addRow(list, 'Código e-Fatura', preferredSector(rec.category));
  addRow(list, 'Confiança', confidenceLabel(rec.confidence));
  addRow(list, 'Porquê', rec.reason);
  for (const alternative of rec.alternatives) {
    addRow(
      list,
      'Alternativa',
      `${categoryById(alternative.category).label} (${preferredSector(alternative.category)}) — ${alternative.reason}${alternative.warning === null ? '' : ` ⚠ ${alternative.warning}`}`,
    );
  }
  if (info.note !== null) addRow(list, 'Nota', info.note);
  if (rec.warning !== null) addRow(list, 'Aviso', rec.warning);

  testResult.replaceChildren(list);
  testResult.classList.add('visible');
}

async function save(): Promise<void> {
  saveButton.disabled = true;
  try {
    await saveSettings({
      nifptKey: nifptKey.value.trim(),
      autoApply: autoApply.checked,
      enabled: enabled.checked,
      showPanel: showPanel.checked,
    });
    saveStatus.textContent = 'Guardado.';
    window.setTimeout(() => {
      saveStatus.textContent = '';
    }, 2500);
  } finally {
    saveButton.disabled = false;
  }
}

async function runTest(): Promise<void> {
  const nif = normalizeNif(testNif.value);
  if (nif === null || !isValidNif(nif)) {
    testStatus.textContent = 'NIF inválido.';
    testResult.classList.remove('visible');
    return;
  }

  testButton.disabled = true;
  testStatus.textContent = 'A consultar nif.pt, VIES e Racius…';
  try {
    const response = await sendWorker({
      type: 'test-lookup',
      nif,
      name: testName.value.trim(),
    });
    if (response === null) {
      testStatus.textContent = 'Sem resposta do serviço.';
      return;
    }
    if (!response.ok) {
      testStatus.textContent = response.error;
      return;
    }
    if (response.kind !== 'lookup') {
      testStatus.textContent = 'Resposta inesperada.';
      return;
    }
    testStatus.textContent = '';
    renderResult(response.info, testName.value.trim());
  } finally {
    testButton.disabled = false;
  }
}

async function clearCache(): Promise<void> {
  clearButton.disabled = true;
  try {
    const response = await sendWorker({ type: 'clear-cache' });
    if (response !== null && response.ok && response.kind === 'cleared') {
      cacheStatus.textContent = `${response.count} entrada${response.count === 1 ? '' : 's'} apagada${response.count === 1 ? '' : 's'}.`;
    } else {
      cacheStatus.textContent = 'Não foi possível limpar a cache.';
    }
  } finally {
    clearButton.disabled = false;
  }
}

saveButton.addEventListener('click', () => {
  void save();
});
testButton.addEventListener('click', () => {
  void runTest();
});
clearButton.addEventListener('click', () => {
  void clearCache();
});

void (async () => {
  const settings = await loadSettings();
  enabled.checked = settings.enabled;
  showPanel.checked = settings.showPanel;
  autoApply.checked = settings.autoApply;
  nifptKey.value = settings.nifptKey;

  const stats = await sendWorker({ type: 'cache-stats' });
  if (stats !== null && stats.ok && stats.kind === 'stats') {
    cacheStatus.textContent = `${stats.count} entrada${stats.count === 1 ? '' : 's'} em cache.`;
  }
})();
