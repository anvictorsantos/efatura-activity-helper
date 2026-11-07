/** Portuguese NIFs: nine digits with a mod-11 check digit. */

const NIF_RE = /(?<!\d)([1-9]\d{2})[ .-]?(\d{3})[ .-]?(\d{3})(?!\d)/g;

export function normalizeNif(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 9 ? digits : null;
}

export function isValidNif(raw: string): boolean {
  const nif = normalizeNif(raw);
  if (nif === null) return false;

  const first = nif.charCodeAt(0) - 48;
  if (first < 1 || first > 9 || first === 4) return false;

  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += (nif.charCodeAt(i) - 48) * (9 - i);

  const remainder = sum % 11;
  const check = remainder < 2 ? 0 : 11 - remainder;
  return nif.charCodeAt(8) - 48 === check;
}

/** Every valid NIF in a piece of text, in order, without duplicates. */
export function findNifs(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(NIF_RE)) {
    const head = match[1];
    const middle = match[2];
    const tail = match[3];
    if (head === undefined || middle === undefined || tail === undefined) continue;
    const nif = `${head}${middle}${tail}`;
    if (isValidNif(nif) && !found.includes(nif)) found.push(nif);
  }
  return found;
}

export function extractNif(text: string): string | null {
  return findNifs(text)[0] ?? null;
}
