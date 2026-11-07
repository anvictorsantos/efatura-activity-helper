import type { Confidence, LookupSource } from './types.ts';

export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case 'high':
      return 'Confiança alta';
    case 'medium':
      return 'Confiança média — confirmar';
    case 'low':
      return 'Confiança baixa — confirmar';
  }
}

export function sourceLabel(source: LookupSource): string {
  switch (source) {
    case 'nif.pt':
      return 'nif.pt';
    case 'racius':
      return 'Racius';
    case 'vies':
      return 'VIES';
    case 'name':
      return 'nome';
    case 'none':
      return 'sem dados';
  }
}
