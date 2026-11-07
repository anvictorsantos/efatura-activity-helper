import { isValidNif } from '../core/nif.ts';
import type { SupplierInfo } from '../core/types.ts';

export type WorkerRequest =
  | { type: 'lookup'; nif: string; name: string; refresh: boolean }
  | { type: 'test-lookup'; nif: string; name: string }
  | { type: 'clear-cache' }
  | { type: 'cache-stats' }
  | { type: 'open-options' };

export type WorkerResponse =
  | { ok: true; kind: 'lookup'; info: SupplierInfo }
  | { ok: true; kind: 'cleared'; count: number }
  | { ok: true; kind: 'stats'; count: number }
  | { ok: true; kind: 'opened' }
  | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function parseWorkerRequest(value: unknown): WorkerRequest | null {
  const fields = record(value);
  if (fields === null) return null;

  const type = fields['type'];
  if (type === 'clear-cache' || type === 'cache-stats' || type === 'open-options') {
    return { type };
  }

  if (type === 'lookup' || type === 'test-lookup') {
    const nif = fields['nif'];
    if (typeof nif !== 'string' || !isValidNif(nif)) return null;
    const name = typeof fields['name'] === 'string' ? fields['name'] : '';
    if (type === 'lookup') {
      return { type, nif, name, refresh: fields['refresh'] === true };
    }
    return { type, nif, name };
  }

  return null;
}

export function parseWorkerResponse(value: unknown): WorkerResponse | null {
  const fields = record(value);
  if (fields === null) return null;

  if (fields['ok'] === false) {
    return {
      ok: false,
      error: typeof fields['error'] === 'string' ? fields['error'] : 'erro desconhecido',
    };
  }
  if (fields['ok'] !== true) return null;

  const kind = fields['kind'];
  if (kind === 'lookup') {
    if (typeof fields['info'] !== 'object' || fields['info'] === null) return null;
    return { ok: true, kind, info: fields['info'] as SupplierInfo };
  }
  if (kind === 'cleared' || kind === 'stats') {
    const count = fields['count'];
    if (typeof count !== 'number') return null;
    return { ok: true, kind, count };
  }
  if (kind === 'opened') return { ok: true, kind };
  return null;
}

export type UiRequest =
  | { type: 'ui-status' }
  | { type: 'ui-rescan' }
  | { type: 'ui-toggle-panel' }
  | { type: 'ui-refresh' };

export function parseUiRequest(value: unknown): UiRequest | null {
  const fields = record(value);
  if (fields === null) return null;
  const type = fields['type'];
  if (
    type === 'ui-status' ||
    type === 'ui-rescan' ||
    type === 'ui-toggle-panel' ||
    type === 'ui-refresh'
  ) {
    return { type };
  }
  return null;
}

export interface UiStatus {
  enabled: boolean;
  found: boolean;
  rows: number;
  looked: number;
  pending: number;
  unknown: number;
  panelOpen: boolean;
}

export type UiStatusResponse = { ok: true; status: UiStatus } | { ok: false; error: string };
