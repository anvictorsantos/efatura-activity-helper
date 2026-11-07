/** The European Commission's VAT validation service. No key, no CAE. */
export function viesUrl(nif: string): string {
  return `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/${encodeURIComponent(nif)}`;
}

export interface ViesAnswer {
  valid: boolean;
  name: string | null;
}

export function parseVies(raw: unknown): ViesAnswer {
  if (typeof raw !== 'object' || raw === null) return { valid: false, name: null };

  const fields = raw as Record<string, unknown>;
  const name = typeof fields['name'] === 'string' ? fields['name'].trim() : '';
  const meaningful = name !== '' && name !== '---';
  return {
    valid: fields['isValid'] === true && meaningful,
    name: meaningful ? name : null,
  };
}
