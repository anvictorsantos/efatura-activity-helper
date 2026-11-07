/** The activities the e-Fatura page asks the buyer to pick from. */
export type CategoryId =
  | 'saude'
  | 'educacao'
  | 'habitacao'
  | 'lares'
  | 'gerais'
  | 'auto'
  | 'moto'
  | 'restauracao'
  | 'cabeleireiros'
  | 'veterinaria'
  | 'passes'
  | 'ginasios';

export type Confidence = 'high' | 'medium' | 'low';

export type LookupSource = 'nif.pt' | 'racius' | 'vies' | 'name' | 'none';

/** What the lookup services know about a supplier. Never a guess. */
export interface SupplierInfo {
  nif: string;
  name: string | null;
  cae: string | null;
  caes: string[];
  activity: string | null;
  source: LookupSource;
  note: string | null;
}

export interface Alternative {
  category: CategoryId;
  confidence: Confidence;
  reason: string;
  warning: string | null;
}

export interface Recommendation {
  category: CategoryId;
  confidence: Confidence;
  reason: string;
  caes: string[];
  source: LookupSource;
  warning: string | null;
  /** Other sectors the supplier's CAEs or activity make plausible. */
  alternatives: Alternative[];
}
