import { matchCategoryText } from './categories.ts';
import type { CategoryId } from './types.ts';

/**
 * The portal's own `ambitoAquisicao` values, taken from its catalog. The page
 * may only offer the sectors that apply to a given invoice, so the preferred
 * code is tried first and the rest are a fallback.
 */
export const PREFERRED_SECTOR: Readonly<Record<CategoryId, string>> = {
  auto: 'C01',
  moto: 'C02',
  restauracao: 'C03',
  cabeleireiros: 'C04',
  saude: 'C05',
  educacao: 'C06',
  habitacao: 'C07',
  lares: 'C08',
  veterinaria: 'C09',
  passes: 'C10',
  ginasios: 'C11',
  gerais: 'C99',
};

const SECTOR_CATEGORY: Readonly<Record<string, CategoryId>> = {
  C01: 'auto',
  C02: 'moto',
  C03: 'restauracao',
  C04: 'cabeleireiros',
  C05: 'saude',
  C06: 'educacao',
  C07: 'habitacao',
  C08: 'lares',
  C09: 'veterinaria',
  C10: 'passes',
  C11: 'ginasios',
  C12: 'gerais',
  C13: 'educacao',
  C14: 'gerais',
  C15: 'gerais',
  C26: 'educacao',
  C99: 'gerais',
};

export function isSectorValue(raw: string): boolean {
  return /^C\d{2}$/i.test(raw.trim());
}

export function categoryForSector(raw: string): CategoryId | null {
  return SECTOR_CATEGORY[raw.trim().toUpperCase()] ?? null;
}

export function preferredSector(category: CategoryId): string {
  return PREFERRED_SECTOR[category];
}

/**
 * The page renders the sectors as buttons whose `value` is the code, with the
 * label hidden in the icon's aria-label. The code is authoritative; the label
 * is the fallback for older markup.
 */
export function categoryFromControl(value: string, label: string): CategoryId | null {
  return categoryForSector(value) ?? matchCategoryText(label);
}
