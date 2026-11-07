import { normalizeText } from './categories.ts';
import type { CategoryId } from './types.ts';

interface Rule {
  category: CategoryId;
  pattern: RegExp;
  matched: string;
}

const rules: readonly Rule[] = [
  {
    category: 'veterinaria',
    pattern: /\b(veterin\w*|clinica animal|animais?|pet|canil|gatil|pet ?shop)\b/,
    matched: 'palavra veterinária',
  },
  {
    category: 'cabeleireiros',
    pattern: /\b(cabeleireir\w*|barbeir\w*|barbearia|salao de beleza|estetic\w*|manicure|pedicure|unhas|spa)\b/,
    matched: 'palavra de cabeleireiro/beleza',
  },
  {
    category: 'lares',
    pattern: /\b(lar|lares|residencia senior|terceira idade|apoio domiciliario|santa casa|misericordia|centro social|ipss)\b/,
    matched: 'palavra de lar/apoio social',
  },
  {
    category: 'ginasios',
    pattern: /\b(ginasio|fitness|crossfit|pilates|yoga|padel|natacao|health club|solinca)\b/,
    matched: 'palavra de ginásio',
  },
  {
    category: 'passes',
    pattern: /\b(comboios de portugal|carris|metro|transtejo|soflusa|fertagus|fertaguas|stcp|rede expressos|rodoviaria|autocarros|transportes publicos|flixbus|ryanair|easyjet)\b/,
    matched: 'palavra de transporte público',
  },
  {
    category: 'restauracao',
    pattern: /\b(restaurante|restauracao|cafe|cafetaria|pastelaria|padaria|cervejaria|bar|snack|pizzaria|hamburguer|hotel|pousada|pensao|alojamento|hostel|turismo|catering|cantina|gelataria|tasca|churrasqueira|confeitaria|marisqueira)\b/,
    matched: 'palavra de restauração/alojamento',
  },
  {
    category: 'auto',
    pattern: /\b(oficina|garagem|pneus?|stand automovel|reparacao de auto\w*|reparacao auto\w*|auto reparacao|pecas auto\w*|mecanica auto\w*|automoveis|auto servico de reparacao)\b/,
    matched: 'palavra de reparação automóvel',
  },
  {
    category: 'moto',
    pattern: /\b(motociclos?|motos?|scooter|vespa|kawasaki|suzuki|yamaha moto)\b/,
    matched: 'palavra de motociclos',
  },
  {
    category: 'educacao',
    pattern: /\b(escola|colegio|explicac\w*|explicacoes|formacao|ensino|universidade|instituto|academia|livraria|papelaria|creche|infantario|jardim de infancia|curso|idiomas|educacao)\b/,
    matched: 'palavra de educação',
  },
  {
    category: 'saude',
    pattern: /\b(farmacia|parafarmacia|clinica|hospital|medic\w*|dental|dentaria|dentista|ortodon\w*|fisioterap\w*|analises|laboratorio|radiolog\w*|imagiol\w*|psicolog\w*|terapia|enfermag\w*|optica|ortopedia|saude|wells)\b/,
    matched: 'palavra de saúde',
  },
  {
    category: 'habitacao',
    pattern: /\b(imobiliaria|arrendamento|condominio|gestao de imoveis|rendas)\b/,
    matched: 'palavra de habitação',
  },
];

export interface KeywordMatch {
  category: CategoryId;
  matched: string;
}

/**
 * Returns every distinct category mentioned, in rule order: an activity can
 * legitimately describe more than one sector. Order is deliberate: veterinary
 * before health, and the broad "restauração" rule before "auto".
 */
export function categoriesFromName(name: string): KeywordMatch[] {
  const normalized = normalizeText(name);
  if (normalized === '') return [];

  const found: KeywordMatch[] = [];
  for (const rule of rules) {
    if (!rule.pattern.test(normalized)) continue;
    if (found.some((item) => item.category === rule.category)) continue;
    found.push({ category: rule.category, matched: rule.matched });
  }
  return found;
}

/** A name is weaker evidence than a CAE, so the first match is only a hint. */
export function categoryFromName(name: string): KeywordMatch | null {
  return categoriesFromName(name)[0] ?? null;
}
