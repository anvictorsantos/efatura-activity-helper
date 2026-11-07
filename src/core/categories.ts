import type { CategoryId } from './types.ts';

export interface Category {
  id: CategoryId;
  /** The label the e-Fatura page uses. "Outro" stands for general family expenses. */
  label: string;
  aliases: string[];
  hint: string;
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'saude',
    label: 'Saúde',
    aliases: ['despesas de saúde', 'despesas de saude', 'health'],
    hint: 'Farmácias, clínicas, hospitais, medicina dentária, análises, óticas.',
  },
  {
    id: 'educacao',
    label: 'Educação',
    aliases: ['despesas de educação', 'despesas de educacao', 'ensino', 'formação'],
    hint: 'Escolas, colégios, explicações, formação, livrarias e papelarias.',
  },
  {
    id: 'habitacao',
    label: 'Habitação',
    aliases: ['despesas de habitação', 'despesas de habitacao', 'rendas'],
    hint: 'Rendas e juros de crédito à habitação.',
  },
  {
    id: 'lares',
    label: 'Lares',
    aliases: ['despesas com lares', 'lar', 'apoio domiciliário', 'residência sénior'],
    hint: 'Lares, apoio domiciliário e instituições de apoio a idosos.',
  },
  {
    id: 'gerais',
    label: 'Outro',
    aliases: [
      'despesas gerais familiares',
      'despesas gerais',
      'gerais',
      'outros',
      'general',
    ],
    hint: 'Vestuário, supermercado, combustível, telecomunicações, água, gás e afins.',
  },
  {
    id: 'auto',
    label: 'Reparação de Automóveis',
    aliases: ['despesas com reparação de automóveis', 'reparação de automóveis', 'automóveis'],
    hint: 'Oficinas, pneus e peças montadas em veículos automóveis.',
  },
  {
    id: 'moto',
    label: 'Reparação de Motociclos',
    aliases: ['despesas com reparação de motociclos', 'reparação de motociclos', 'motociclos'],
    hint: 'Oficinas e peças de motociclos.',
  },
  {
    id: 'restauracao',
    label: 'Restauração e Alojamento',
    aliases: [
      'despesas com restauração e alojamento',
      'restauração e alojamento',
      'restauração',
      'alojamento',
    ],
    hint: 'Restaurantes, cafés, pastelarias, bares, hotéis e alojamento local.',
  },
  {
    id: 'cabeleireiros',
    label: 'Cabeleireiros',
    aliases: ['despesas com cabeleireiros', 'cabeleireiro', 'beleza'],
    hint: 'Cabeleireiros e institutos de beleza.',
  },
  {
    id: 'veterinaria',
    label: 'Atividades Veterinárias',
    aliases: ['despesas com atividades veterinárias', 'atividades veterinárias', 'veterinária'],
    hint: 'Clínicas veterinárias, medicamentos e cuidados a animais.',
  },
  {
    id: 'passes',
    label: 'Passes Mensais',
    aliases: ['despesas com passes mensais', 'passes mensais', 'passes', 'transportes públicos'],
    hint: 'Passes mensais de transportes públicos coletivos.',
  },
  {
    id: 'ginasios',
    label: 'Ginásios',
    aliases: ['despesas com ginásios', 'ginásio', 'fitness'],
    hint: 'Ginásios e atividades de manutenção física.',
  },
] as const;

const BY_ID = new Map<CategoryId, Category>(CATEGORIES.map((category) => [category.id, category]));

export function categoryById(id: CategoryId): Category {
  const category = BY_ID.get(id);
  if (category === undefined) throw new Error(`unknown category ${id}`);
  return category;
}

/** Lowercase, accent-free, single-spaced: the form used for every comparison. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function categoryTexts(category: Category): string[] {
  return [category.label, ...category.aliases];
}

/**
 * Exact alias match first, then the longest alias contained in the text.
 * Containment needs six characters so a stray "lar" or "auto" cannot win.
 */
export function matchCategoryText(text: string): CategoryId | null {
  const normalized = normalizeText(text);
  if (normalized === '') return null;

  for (const category of CATEGORIES) {
    for (const candidate of categoryTexts(category)) {
      if (normalized === normalizeText(candidate)) return category.id;
    }
  }

  // Option labels often carry a suffix ("Saúde - 23%"), so a short text may
  // begin with the label. Long prose is only searched for a distinctive alias.
  const short = normalized.length <= 40;
  let best: { id: CategoryId; length: number } | null = null;
  for (const category of CATEGORIES) {
    for (const candidate of categoryTexts(category)) {
      const alias = normalizeText(candidate);
      if (alias.length < 4) continue;
      if (short && normalized.startsWith(`${alias} `)) return category.id;
      if (alias.length < 6 || !normalized.includes(alias)) continue;
      if (best === null || alias.length > best.length) best = { id: category.id, length: alias.length };
    }
  }
  return best?.id ?? null;
}

/** True when the text names this category exactly, for card-like elements. */
export function isCategoryLabel(text: string, id: CategoryId): boolean {
  return normalizeText(text) === normalizeText(categoryById(id).label);
}
