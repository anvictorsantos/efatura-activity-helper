import type { UiRequest, UiStatus, UiStatusResponse } from '../infra/protocol.ts';

const PORTAL_URL =
  'https://faturas.portaldasfinancas.gov.pt/resolverListaPendenciasAdquirenteForm.action';
const PORTAL_MATCH = /^https:\/\/faturas\.portaldasfinancas\.gov\.pt\//;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}

const statusElement = byId<HTMLElement>('status');
const counts = byId<HTMLElement>('counts');
const countRows = byId<HTMLElement>('countRows');
const countLooked = byId<HTMLElement>('countLooked');
const countPending = byId<HTMLElement>('countPending');
const countUnknown = byId<HTMLElement>('countUnknown');

const rescan = byId<HTMLButtonElement>('rescan');
const panelButton = byId<HTMLButtonElement>('panel');
const refresh = byId<HTMLButtonElement>('refresh');
const options = byId<HTMLButtonElement>('options');
const openPortal = byId<HTMLButtonElement>('openPortal');

function numberField(fields: Record<string, unknown>, key: string): number {
  const value = fields[key];
  return typeof value === 'number' ? value : 0;
}

function asStatusResponse(value: unknown): UiStatusResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const fields = value as Record<string, unknown>;

  if (fields['ok'] === false) {
    return {
      ok: false,
      error: typeof fields['error'] === 'string' ? fields['error'] : 'erro desconhecido',
    };
  }
  if (fields['ok'] !== true) return null;

  const raw = fields['status'];
  if (typeof raw !== 'object' || raw === null) return null;
  const status = raw as Record<string, unknown>;

  const parsed: UiStatus = {
    enabled: status['enabled'] === true,
    found: status['found'] === true,
    rows: numberField(status, 'rows'),
    looked: numberField(status, 'looked'),
    pending: numberField(status, 'pending'),
    unknown: numberField(status, 'unknown'),
    panelOpen: status['panelOpen'] === true,
  };
  return { ok: true, status: parsed };
}

function sendToTab(tabId: number, request: UiRequest): Promise<UiStatusResponse | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, request, (response: unknown) => {
      const error = chrome.runtime.lastError;
      if (error !== undefined) {
        resolve(null);
        return;
      }
      resolve(asStatusResponse(response));
    });
  });
}

function render(response: UiStatusResponse): void {
  if (!response.ok) {
    statusElement.textContent = response.error;
    statusElement.classList.add('error');
    counts.hidden = true;
    return;
  }

  statusElement.classList.remove('error');
  const status = response.status;

  if (!status.enabled) {
    statusElement.textContent = 'Extensão desativada. Ative-a nas opções.';
    counts.hidden = true;
    return;
  }
  if (!status.found) {
    statusElement.textContent = 'Tabela de pendências não encontrada neste separador.';
    counts.hidden = true;
    return;
  }

  statusElement.textContent = `${status.looked} de ${status.rows} NIFs consultados.`;
  counts.hidden = false;
  countRows.textContent = String(status.rows);
  countLooked.textContent = String(status.looked);
  countPending.textContent = String(status.pending);
  countUnknown.textContent = String(status.unknown);
}

function fail(message: string): void {
  statusElement.textContent = message;
  statusElement.classList.add('error');
  counts.hidden = true;
}

async function init(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;

  if (tab === undefined || tabId === undefined || !PORTAL_MATCH.test(tab.url ?? '')) {
    fail('Abra a lista de pendências do e-Fatura neste separador.');
    rescan.disabled = true;
    panelButton.disabled = true;
    refresh.disabled = true;
    return;
  }

  const first = await sendToTab(tabId, { type: 'ui-status' });
  if (first === null) {
    fail('A extensão não está ativa nesta página. Recarregue-a.');
    rescan.disabled = true;
    panelButton.disabled = true;
    refresh.disabled = true;
    return;
  }
  render(first);

  const act = (request: UiRequest) => {
    void (async () => {
      const response = await sendToTab(tabId, request);
      if (response === null) fail('A página deixou de responder. Recarregue-a.');
      else render(response);
    })();
  };

  rescan.addEventListener('click', () => act({ type: 'ui-rescan' }));
  panelButton.addEventListener('click', () => act({ type: 'ui-toggle-panel' }));
  refresh.addEventListener('click', () => act({ type: 'ui-refresh' }));
}

options.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});
openPortal.addEventListener('click', () => {
  void chrome.tabs.create({ url: PORTAL_URL });
});

void init();
