import { digitsOfCae, categoryForCae } from './cae.ts';
import { categoriesFromName } from './heuristic.ts';
import type {
  Alternative,
  CategoryId,
  Confidence,
  Recommendation,
  SupplierInfo,
} from './types.ts';

interface Draft {
  category: CategoryId;
  confidence: Confidence;
  reason: string;
  warning: string | null;
  /** Lower wins: primary CAE, safe Outro, secondary CAE, activity, name… */
  rank: number;
}

const SECONDARY_WARNING = 'CAE secundário; se o portal recusar, escolha Outro.';
const ACTIVITY_WARNING =
  'A atividade mencionada sugere-o, mas nenhum CAE o confirma; o portal pode recusar.';
const NAME_WARNING = 'Só o nome sugere isto; o CAE não confirma — o portal pode recusar.';
const MULTI_REASON = 'Fornecedor com várias atividades — Outro é a opção segura.';

function healthWarning(category: CategoryId, rowText: string): string | null {
  if (category !== 'saude') return null;
  if (!/(23\s*%|taxa\s*normal|iva\s*(a|de)?\s*23)/i.test(rowText)) return null;
  return 'IVA a 23%: indique se tem receita médica e qual o valor da despesa.';
}

function withHealth(draft: Draft, rowText: string): Draft {
  const health = healthWarning(draft.category, rowText);
  if (health === null) return draft;
  return {
    ...draft,
    warning: draft.warning === null ? health : `${draft.warning} ${health}`,
  };
}

/** Keep the strongest evidence for a category; never show it twice. */
function addDraft(drafts: Draft[], draft: Draft): void {
  const existing = drafts.find((item) => item.category === draft.category);
  if (existing === undefined) {
    drafts.push(draft);
    return;
  }
  if (draft.rank < existing.rank) {
    drafts[drafts.indexOf(existing)] = draft;
  }
}

function base(
  info: SupplierInfo | null,
  draft: Omit<Draft, 'rank'>,
  alternatives: Alternative[],
): Recommendation {
  return {
    category: draft.category,
    confidence: draft.confidence,
    reason: draft.reason,
    caes: info?.caes ?? [],
    source: info?.source ?? 'none',
    warning: draft.warning,
    alternatives,
  };
}

/**
 * The portal validates the chosen sector against the supplier's registered
 * CAE/CIRS, and one supplier can belong to more than one sector. So the safe
 * choice is Outro whenever the primary CAE does not confirm a specific sector,
 * and every other plausible sector is offered as an alternative for the user
 * to decide.
 */
export function recommend(
  info: SupplierInfo | null,
  supplierName: string,
  rowText: string,
): Recommendation {
  const caes = info?.caes ?? [];
  const primaryCode = caes[0];
  const primaryDigits = primaryCode === undefined ? '' : digitsOfCae(primaryCode);
  const primaryMatch = primaryCode === undefined ? null : categoryForCae(primaryCode);
  const drafts: Draft[] = [];

  if (primaryMatch !== null) {
    const detail =
      primaryMatch.name === null
        ? `CAE principal ${primaryMatch.code}`
        : `CAE principal ${primaryMatch.code} — ${primaryMatch.name}`;
    addDraft(drafts, {
      category: primaryMatch.category,
      confidence: 'high',
      reason: detail,
      warning: null,
      rank: 0,
    });
  }

  for (const code of caes.slice(1)) {
    const match = categoryForCae(code);
    if (match === null) continue;
    const detail =
      match.name === null
        ? `CAE secundário ${match.code}`
        : `CAE secundário ${match.code} — ${match.name}`;
    addDraft(drafts, {
      category: match.category,
      confidence: 'medium',
      reason: detail,
      warning: SECONDARY_WARNING,
      rank: 2,
    });
  }

  // Registered activities decide first. The free-text activity only speaks
  // when no CAE maps, and the trade name only when the activity says nothing:
  // a corporate object lists many businesses and would otherwise add noise.
  if (drafts.length === 0) {
    const activityHits = categoriesFromName(info?.activity ?? '').slice(0, 2);
    for (const hit of activityHits) {
      addDraft(drafts, {
        category: hit.category,
        confidence: 'medium',
        reason: `Atividade: ${hit.matched}`,
        warning: ACTIVITY_WARNING,
        rank: 3,
      });
    }

    if (activityHits.length === 0) {
      for (const hit of categoriesFromName(`${info?.name ?? ''} ${supplierName}`).slice(0, 1)) {
        addDraft(drafts, {
          category: hit.category,
          confidence: 'low',
          reason: `Nome: ${hit.matched}`,
          warning: NAME_WARNING,
          rank: 4,
        });
      }
    }
  }

  const foodRetail = /^(4711|4712|472)/.test(primaryDigits);
  if (foodRetail && !drafts.some((draft) => draft.category === 'restauracao')) {
    addDraft(drafts, {
      category: 'restauracao',
      confidence: 'low',
      reason: 'Retalho alimentar pode incluir refeições prontas.',
      warning: null,
      rank: 5,
    });
  }

  const hasPrimaryCae = primaryMatch !== null;
  const distinct = new Set(drafts.map((draft) => draft.category));

  if (!hasPrimaryCae) {
    if (caes.length === 0) {
      addDraft(drafts, {
        category: 'gerais',
        confidence: drafts.length === 0 ? 'low' : 'medium',
        reason:
          drafts.length === 0
            ? (info?.note ?? 'Sem CAE nem palavra-chave reconhecida — confirmar manualmente.')
            : 'Sem CAE — Outro é a opção segura.',
        warning: null,
        rank: 1,
      });
    } else {
      addDraft(drafts, {
        category: 'gerais',
        confidence: 'high',
        reason: `CAE principal ${primaryDigits} — sem categoria específica; escolha Outro.`,
        warning: null,
        rank: 1,
      });
    }
  } else if (distinct.size >= 2) {
    addDraft(drafts, {
      category: 'gerais',
      confidence: 'high',
      reason: MULTI_REASON,
      warning: null,
      rank: 6,
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      category: 'gerais',
      confidence: 'low',
      reason: info?.note ?? 'Sem CAE nem palavra-chave reconhecida — confirmar manualmente.',
      warning: null,
      rank: 1,
    });
  }

  const ordered = drafts
    .map((draft) => withHealth(draft, rowText))
    .sort((a, b) => a.rank - b.rank || a.category.localeCompare(b.category));

  const [primary, ...rest] = ordered;
  if (primary === undefined) {
    return base(
      info,
      {
        category: 'gerais',
        confidence: 'low',
        reason: info?.note ?? 'Sem dados.',
        warning: null,
      },
      [],
    );
  }

  return base(
    info,
    primary,
    rest.map((draft) => ({
      category: draft.category,
      confidence: draft.confidence,
      reason: draft.reason,
      warning: draft.warning,
    })),
  );
}
