import { slugCandidates } from '../core/slug.ts';
import type { SupplierInfo } from '../core/types.ts';
import {
  isKeyNeeded,
  nifptPageUrl,
  nifptUrl,
  parseNifpt,
  parseNifptPage,
} from './nifpt.ts';
import { parseRacius, raciusUrl } from './racius.ts';
import { parseVies, viesUrl } from './vies.ts';

export interface Fetched {
  status: number;
  text: string;
}

export type Fetcher = (url: string) => Promise<Fetched>;

export interface LookupOptions {
  nifptKey: string | null;
  fetch: Fetcher;
  /** Caps the Racius attempts; the worker passes the default. */
  maxSlugTries?: number;
}

const MAX_SLUG_TRIES = 5;

/** A successful fallback still says which earlier sources did not answer. */
function mergeNotes(notes: readonly string[], extra: string | null): string | null {
  const parts = extra === null ? [...notes] : [...notes, extra];
  return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * nif.pt is the only source with a scheduled CAE and a free-text activity, so
 * it is tried first when a key exists. Its public page needs no key and links
 * to the exact Racius profile, which a name-derived slug cannot always guess.
 * VIES confirms the NIF and gives the registered name. Failures never throw:
 * the caller gets what was found, plus a note saying what was not.
 */
export async function lookupSupplier(
  nif: string,
  name: string,
  options: LookupOptions,
): Promise<SupplierInfo> {
  const notes: string[] = [];
  const key = options.nifptKey?.trim() ?? '';

  if (key !== '') {
    try {
      const response = await options.fetch(nifptUrl(nif, key));
      if (response.status === 200) {
        const json: unknown = JSON.parse(response.text);
        if (isKeyNeeded(json)) {
          notes.push('nif.pt: chave recusada');
        } else {
          const info = parseNifpt(json, nif);
          if (info !== null) return info;
          notes.push('nif.pt: sem dados');
        }
      } else {
        notes.push(`nif.pt: HTTP ${response.status}`);
      }
    } catch {
      notes.push('nif.pt: sem resposta');
    }
  } else {
    notes.push('nif.pt: sem chave (opcional nas opções)');
  }

  let pageName: string | null = null;
  let pageSlug: string | null = null;
  try {
    const response = await options.fetch(nifptPageUrl(nif));
    if (response.status === 200) {
      const page = parseNifptPage(response.text, nif);
      pageName = page.name;
      pageSlug = page.slug;
      if (pageSlug === null) notes.push('nif.pt: página sem ligação Racius');
    } else {
      notes.push(`nif.pt: página HTTP ${response.status}`);
    }
  } catch {
    notes.push('nif.pt: página sem resposta');
  }

  if (pageSlug !== null) {
    try {
      const response = await options.fetch(raciusUrl(pageSlug));
      if (response.status === 200) {
        const info = parseRacius(response.text, nif);
        if (info !== null) return { ...info, note: mergeNotes(notes, info.note) };
        notes.push('racius: página sem o NIF');
      } else {
        notes.push(`racius: HTTP ${response.status}`);
      }
    } catch {
      notes.push('racius: sem resposta');
    }
  }

  let canonical: string | null = null;
  try {
    const response = await options.fetch(viesUrl(nif));
    if (response.status === 200) {
      const vies = parseVies(JSON.parse(response.text));
      if (vies.valid) canonical = vies.name;
      else notes.push('VIES: NIF inválido');
    } else {
      notes.push(`VIES: HTTP ${response.status}`);
    }
  } catch {
    notes.push('VIES: sem resposta');
  }

  const tried = new Set<string>(pageSlug === null ? [] : [pageSlug]);
  const names = [canonical, pageName, name].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const slugs = [...new Set(names.flatMap((value) => slugCandidates(value)))]
    .filter((slug) => !tried.has(slug))
    .slice(0, options.maxSlugTries ?? MAX_SLUG_TRIES);

  for (const slug of slugs) {
    try {
      const response = await options.fetch(raciusUrl(slug));
      if (response.status !== 200) continue;
      const info = parseRacius(response.text, nif);
      if (info !== null) return { ...info, note: mergeNotes(notes, info.note) };
    } catch {
      // Try the next spelling; the last failure becomes the note below.
    }
  }
  notes.push('racius: não encontrado');

  const knownName = canonical ?? pageName ?? (name.trim() === '' ? null : name.trim());
  return {
    nif,
    name: knownName,
    cae: null,
    caes: [],
    activity: null,
    source: canonical !== null ? 'vies' : knownName !== null ? 'name' : 'none',
    note: notes.join('; '),
  };
}
