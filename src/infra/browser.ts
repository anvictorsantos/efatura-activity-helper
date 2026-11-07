import type { LookupSource, SupplierInfo } from '../core/types.ts';

export interface Settings {
  nifptKey: string;
  autoApply: boolean;
  enabled: boolean;
  showPanel: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  nifptKey: '',
  autoApply: false,
  enabled: true,
  showPanel: true,
};

const SETTINGS_KEY = 'settings';
const CACHE_PREFIX = 'supplier:';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const SOURCES: ReadonlySet<string> = new Set<LookupSource>(['nif.pt', 'racius', 'vies', 'name', 'none']);
const CAE_RE = /^\d{2,5}$/;

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function caeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && CAE_RE.test(item)))];
}

export function validateSupplierInfo(raw: unknown, nif: string): SupplierInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const fields = raw as Record<string, unknown>;

  const source = fields['source'];
  if (typeof source !== 'string' || !SOURCES.has(source)) return null;

  const caes = caeList(fields['caes']);
  const caeField = fields['cae'];
  const cae =
    typeof caeField === 'string' && CAE_RE.test(caeField) ? caeField : (caes[0] ?? null);

  return {
    nif,
    name: optionalString(fields['name']),
    cae,
    caes,
    activity: optionalString(fields['activity']),
    source: source as LookupSource,
    note: optionalString(fields['note']),
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const raw: unknown = stored[SETTINGS_KEY];
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };

  const fields = raw as Record<string, unknown>;
  return {
    nifptKey: asString(fields['nifptKey'], DEFAULT_SETTINGS.nifptKey).trim(),
    autoApply: asBoolean(fields['autoApply'], DEFAULT_SETTINGS.autoApply),
    enabled: asBoolean(fields['enabled'], DEFAULT_SETTINGS.enabled),
    showPanel: asBoolean(fields['showPanel'], DEFAULT_SETTINGS.showPanel),
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

interface CacheRecord {
  at: number;
  info: SupplierInfo;
}

export async function readCache(nif: string): Promise<SupplierInfo | null> {
  const key = CACHE_PREFIX + nif;
  const stored = await chrome.storage.local.get(key);
  const raw: unknown = stored[key];
  if (typeof raw !== 'object' || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const at = record['at'];
  if (typeof at !== 'number' || Date.now() - at > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return validateSupplierInfo(record['info'], nif);
}

export async function writeCache(info: SupplierInfo): Promise<void> {
  const record: CacheRecord = { at: Date.now(), info };
  await chrome.storage.local.set({ [CACHE_PREFIX + info.nif]: record });
}

export async function clearSupplierCache(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
  return keys.length;
}

export async function cacheCount(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX)).length;
}
