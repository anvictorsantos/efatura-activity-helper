/** Racius company pages are addressed by a slug of the registered name. */

const LEGAL_FORMS: readonly (readonly string[])[] = [
  ['lda'],
  ['sa'],
  ['sociedade', 'unipessoal', 'lda'],
  ['unipessoal', 'lda'],
  ['sociedade', 'anonima'],
  ['sgps'],
  ['limitada'],
  ['crl'],
  ['ciprl'],
];

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The name as written, minus its legal form, plus the usual suffixes. */
export function slugCandidates(name: string): string[] {
  const base = slugify(name);
  if (base.length < 3) return [];

  const tokens = base.split('-');
  const candidates = new Set<string>([base]);

  for (const form of LEGAL_FORMS) {
    const size = form.length;
    if (tokens.length <= size) continue;
    const tail = tokens.slice(-size);
    if (form.every((word, index) => tail[index] === word)) {
      const trimmed = tokens.slice(0, -size).join('-');
      if (trimmed.length >= 3) candidates.add(trimmed);
    }
  }

  const shortest = [...candidates].sort((a, b) => a.length - b.length)[0];
  if (shortest !== undefined) {
    candidates.add(`${shortest}-lda`);
    candidates.add(`${shortest}-sa`);
  }

  return [...candidates].filter((slug) => slug.length >= 3 && slug.length <= 120);
}
