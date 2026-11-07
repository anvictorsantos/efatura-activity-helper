import { digitsOfCae } from '../core/cae.ts';
import type { SupplierInfo } from '../core/types.ts';
import { decodeEntities } from './html.ts';

/** nif.pt's free JSON API needs a key requested from the site. */
export function nifptUrl(nif: string, key: string): string {
  return `https://www.nif.pt/?json=1&q=${encodeURIComponent(nif)}&key=${encodeURIComponent(key)}`;
}

/** The public page needs no key and links to the company's Racius profile. */
export function nifptPageUrl(nif: string): string {
  return `https://www.nif.pt/${encodeURIComponent(nif)}/`;
}

export interface NifptPage {
  name: string | null;
  /** The exact Racius slug, which a name cannot always reproduce. */
  slug: string | null;
}

export function parseNifptPage(html: string, nif: string): NifptPage {
  const digits = html.replace(/\D/g, '');
  if (!digits.includes(nif.replace(/\D/g, ''))) return { name: null, slug: null };

  const slugMatch = /https?:\/\/www\.racius\.com\/([a-z0-9-]+)\/?/i.exec(html);
  const titleMatch = /title=["']([^"']+?)\s+-\s+Informação Financeira["']/i.exec(html);
  const descriptionMatch = /pertence (?:à|a) empresa ([^.]+)\./i.exec(html);

  const rawName = (titleMatch?.[1] ?? descriptionMatch?.[1] ?? '').trim();
  return {
    name: rawName === '' ? null : decodeEntities(rawName),
    slug: slugMatch?.[1] ?? null,
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

export function isKeyNeeded(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const message = (raw as Record<string, unknown>)['message'];
  return typeof message === 'string' && /key necessary/i.test(message);
}

export function parseNifpt(raw: unknown, nif: string): SupplierInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const records = (raw as Record<string, unknown>)['records'];
  if (typeof records !== 'object' || records === null) return null;

  const record = (records as Record<string, unknown>)[nif];
  if (typeof record !== 'object' || record === null) return null;

  const fields = record as Record<string, unknown>;
  const name = text(fields['title']);
  const cae = digitsOfCae(text(fields['cae']));
  const activity = text(fields['activity']);

  if (name === '' && cae === '' && activity === '') return null;

  const hasCae = cae.length >= 2;
  return {
    nif,
    name: name === '' ? null : name,
    cae: hasCae ? cae : null,
    caes: hasCae ? [cae] : [],
    activity: activity === '' ? null : activity,
    source: 'nif.pt',
    note: null,
  };
}
