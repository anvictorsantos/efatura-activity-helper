import type { SupplierInfo } from '../core/types.ts';
import { decodeEntities } from './html.ts';

/** Racius addresses a company by a slug of its registered name. */
export function raciusUrl(slug: string): string {
  return `https://www.racius.com/${encodeURIComponent(slug)}/`;
}

function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match?.[1] === undefined) return null;
  const title = decodeEntities(match[1]);
  return title === '' ? null : title;
}

const ANCHOR_CAE =
  /<a[^>]*href=['"][^'"]+['"][^>]*>\s*<span[^>]*>\s*(\d{5})\s*<\/span>\s*(?:&nbsp;| )*\s*-\s*(?:&nbsp;| )*\s*<span[^>]*>([^<]+)<\/span>/gi;

const PLAIN_CAE = /(\d{5})\s*-\s*([^<>]{2,120}?)(?=\s+\d{5}\s*-|$)/g;

function caeSection(html: string): string {
  const start = html.search(/>\s*CAE\s*</i);
  if (start < 0) return '';
  const slice = html.slice(start, start + 4000);
  const end = slice.search(/ico-[a-z]/i);
  return end > 200 ? slice.slice(0, end) : slice;
}

export function parseRaciusCaes(html: string): string[] {
  const section = caeSection(html);
  if (section === '') return [];

  const codes: string[] = [];
  for (const match of section.matchAll(ANCHOR_CAE)) {
    const code = match[1];
    if (code !== undefined) codes.push(code);
  }

  if (codes.length === 0) {
    const plain = section
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;| /gi, ' ')
      .replace(/\s+/g, ' ');
    for (const match of plain.matchAll(PLAIN_CAE)) {
      const code = match[1];
      const name = match[2]?.trim() ?? '';
      if (code !== undefined && name.length >= 3) codes.push(code);
    }
  }

  return [...new Set(codes)].filter((code) => Number(code.slice(0, 2)) > 0);
}

/** The free-text activity often names a sector the primary CAE does not. */
export function parseRaciusActivity(html: string): string | null {
  const start = html.search(/>\s*Atividade\s*</i);
  if (start < 0) return null;

  const slice = html.slice(start, start + 3000);
  const end = slice.search(/ico-[a-z]|Acerca da Empresa/i);
  const section = end > 60 ? slice.slice(0, end) : slice;

  const text = decodeEntities(
    section.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '),
  )
    .replace(/^Atividade\s*/i, '')
    .trim();

  return text === '' ? null : text.slice(0, 700);
}

/**
 * A wrong slug can land on a different company, so the page must mention the
 * NIF before any of its data is trusted.
 */
export function parseRacius(html: string, nif: string): SupplierInfo | null {
  if (!html.replace(/\D/g, '').includes(nif)) return null;

  const caes = parseRaciusCaes(html);
  return {
    nif,
    name: pageTitle(html),
    cae: caes[0] ?? null,
    caes,
    activity: parseRaciusActivity(html),
    source: 'racius',
    note: caes.length === 0 ? 'Racius: página sem CAE visível.' : null,
  };
}
