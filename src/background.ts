import type { SupplierInfo } from './core/types.ts';
import {
  cacheCount,
  clearSupplierCache,
  loadSettings,
  readCache,
  writeCache,
} from './infra/browser.ts';
import type { Fetched } from './infra/lookup.ts';
import { lookupSupplier } from './infra/lookup.ts';
import type { WorkerRequest, WorkerResponse } from './infra/protocol.ts';
import { parseWorkerRequest } from './infra/protocol.ts';

/** One lookup at a time, with a gap, so a long list does not hammer the sources. */
const GAP_MS = 350;

let queue: Promise<void> = Promise.resolve();
const inFlight = new Map<string, Promise<SupplierInfo>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<Fetched> {
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    },
  });
  return { status: response.status, text: await response.text() };
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const started = queue.then(async () => {
    const result = await task();
    await sleep(GAP_MS);
    return result;
  });
  queue = started.then(
    () => undefined,
    () => undefined,
  );
  return started;
}

async function resolveLookup(nif: string, name: string, refresh: boolean): Promise<SupplierInfo> {
  if (!refresh) {
    const cached = await readCache(nif);
    if (cached !== null) return cached;
  }

  const settings = await loadSettings();
  const info = await enqueue(() =>
    lookupSupplier(nif, name, { nifptKey: settings.nifptKey, fetch: fetchText }),
  );
  if (info.source !== 'none') await writeCache(info);
  return info;
}

async function lookupOnce(nif: string, name: string, refresh: boolean): Promise<SupplierInfo> {
  const running = inFlight.get(nif);
  if (running !== undefined) return running;

  const task = resolveLookup(nif, name, refresh).finally(() => inFlight.delete(nif));
  inFlight.set(nif, task);
  return task;
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  switch (request.type) {
    case 'lookup': {
      const info = await lookupOnce(request.nif, request.name, request.refresh);
      return { ok: true, kind: 'lookup', info };
    }
    case 'test-lookup': {
      const info = await resolveLookup(request.nif, request.name, true);
      return { ok: true, kind: 'lookup', info };
    }
    case 'clear-cache': {
      const count = await clearSupplierCache();
      return { ok: true, kind: 'cleared', count };
    }
    case 'cache-stats': {
      const count = await cacheCount();
      return { ok: true, kind: 'stats', count };
    }
    case 'open-options': {
      await chrome.runtime.openOptionsPage();
      return { ok: true, kind: 'opened' };
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = parseWorkerRequest(message);
  if (request === null) return false;

  void handle(request)
    .then(sendResponse)
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.message : 'erro desconhecido';
      const failure: WorkerResponse = { ok: false, error: text };
      sendResponse(failure);
    });
  return true;
});
