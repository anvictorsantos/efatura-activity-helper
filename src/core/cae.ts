import type { CategoryId } from './types.ts';

/**
 * CAE Rev.3 and Rev.4 both keep the divisions that matter here, so the rules
 * are expressed as prefixes. The longest prefix wins.
 */
const RULES: ReadonlyArray<readonly [string, CategoryId]> = [
  ['45401', 'moto'],
  ['45402', 'moto'],
  ['454', 'moto'],
  ['452', 'auto'],
  ['453', 'auto'],

  ['4773', 'saude'],
  ['4774', 'saude'],
  ['47782', 'saude'],
  ['86', 'saude'],

  ['88910', 'educacao'],
  ['4761', 'educacao'],
  ['4762', 'educacao'],
  ['85', 'educacao'],

  ['681', 'habitacao'],
  ['682', 'habitacao'],
  ['683', 'habitacao'],

  ['871', 'lares'],
  ['872', 'lares'],
  ['873', 'lares'],
  ['879', 'lares'],
  ['881', 'lares'],
  ['889', 'lares'],
  ['87', 'lares'],
  ['88', 'lares'],

  ['47240', 'restauracao'],
  ['551', 'restauracao'],
  ['552', 'restauracao'],
  ['553', 'restauracao'],
  ['559', 'restauracao'],
  ['561', 'restauracao'],
  ['562', 'restauracao'],
  ['563', 'restauracao'],
  ['55', 'restauracao'],
  ['56', 'restauracao'],

  ['9602', 'cabeleireiros'],
  ['47762', 'veterinaria'],
  ['750', 'veterinaria'],

  ['491', 'passes'],
  // 4932 is taxis/TVDE; a taxi ride is not a monthly public-transport pass.
  ['4931', 'passes'],
  ['4939', 'passes'],
  ['501', 'passes'],
  ['503', 'passes'],

  ['9311', 'ginasios'],
  ['9312', 'ginasios'],
  ['9313', 'ginasios'],
];

const BY_PREFIX = new Map<string, CategoryId>(RULES);

const NAMES: Readonly<Record<string, string>> = {
  '452': 'manutenção e reparação de veículos automóveis',
  '453': 'peças e acessórios para veículos automóveis',
  '454': 'comércio e reparação de motociclos',
  '750': 'atividades veterinárias',
  '4773': 'farmácia',
  '4774': 'artigos médicos e ortopédicos',
  '47782': 'material ótico',
  '88910': 'apoio social a crianças',
  '4761': 'livros',
  '4762': 'papelaria',
  '47240': 'padaria e pastelaria',
  '85': 'educação',
  '86': 'saúde humana',
  '87': 'apoio social com alojamento',
  '88': 'apoio social sem alojamento',
  '681': 'imobiliário',
  '682': 'arrendamento de imóveis',
  '683': 'mediação imobiliária',
  '491': 'transporte ferroviário de passageiros',
  '4931': 'transporte urbano e suburbano de passageiros',
  '4939': 'outro transporte terrestre de passageiros',
  '501': 'transporte marítimo de passageiros',
  '503': 'transporte fluvial de passageiros',
  '55': 'alojamento',
  '56': 'restauração',
  '551': 'hotelaria',
  '552': 'alojamento turístico',
  '553': 'campismo',
  '559': 'outro alojamento',
  '561': 'restaurantes',
  '562': 'catering',
  '563': 'bares e cafés',
  '9602': 'cabeleireiros e beleza',
  '47762': 'animais de companhia e alimentos',
  '9311': 'instalações desportivas',
  '9312': 'clubes desportivos',
  '9313': 'ginásios',
};

export interface CaeMatch {
  category: CategoryId;
  prefix: string;
  code: string;
  name: string | null;
}

export function digitsOfCae(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** The most specific rule that covers the code, or null when nothing fits. */
export function categoryForCae(raw: string): CaeMatch | null {
  const digits = digitsOfCae(raw);
  if (digits.length < 2) return null;

  const longest = Math.min(5, digits.length);
  for (let length = longest; length >= 2; length -= 1) {
    const prefix = digits.slice(0, length);
    const category = BY_PREFIX.get(prefix);
    if (category !== undefined) {
      return { category, prefix, code: digits, name: NAMES[prefix] ?? null };
    }
  }
  return null;
}

/** The primary CAE usually decides; a secondary one only rescues an unmapped primary. */
export function classifyCaes(caes: readonly string[]): CaeMatch | null {
  for (const raw of caes) {
    const match = categoryForCae(raw);
    if (match !== null) return match;
  }
  return null;
}

export function caeSummary(caes: readonly string[]): string {
  return caes
    .map((raw) => {
      const code = digitsOfCae(raw);
      const match = categoryForCae(code);
      const name = match?.name ?? null;
      return name === null ? code : `${code} (${name})`;
    })
    .join(', ');
}
