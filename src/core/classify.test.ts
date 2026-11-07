import assert from 'node:assert/strict';
import test from 'node:test';

import { recommend } from './classify.ts';
import type { SupplierInfo } from './types.ts';

function info(overrides: Partial<SupplierInfo>): SupplierInfo {
  return {
    nif: '500330263',
    name: null,
    cae: null,
    caes: [],
    activity: null,
    source: 'racius',
    note: null,
    ...overrides,
  };
}

function alternatives(rec: ReturnType<typeof recommend>): string[] {
  return rec.alternatives.map((alternative) => alternative.category);
}

test('a clean primary CAE is the only suggestion', () => {
  const rec = recommend(info({ caes: ['56101'], cae: '56101' }), 'Qualquer Coisa', '');
  assert.equal(rec.category, 'restauracao');
  assert.equal(rec.confidence, 'high');
  assert.deepEqual(rec.alternatives, []);
});

test('an unmapped primary CAE defaults to Outro, at high confidence', () => {
  const rec = recommend(
    info({ caes: ['47111'], cae: '47111', activity: 'Retalho alimentar' }),
    'CELEIRO CALHARIZ',
    '',
  );
  assert.equal(rec.category, 'gerais');
  assert.equal(rec.confidence, 'high');
  assert.match(rec.reason, /Outro/);
});

test('a secondary CAE is an alternative, never the primary', () => {
  const rec = recommend(info({ caes: ['47111', '45200'] }), 'CELEIRO CALHARIZ', '');
  assert.equal(rec.category, 'gerais');
  assert.equal(rec.confidence, 'high');

  const auto = rec.alternatives.find((alternative) => alternative.category === 'auto');
  assert.ok(auto);
  assert.equal(auto.confidence, 'medium');
  assert.match(auto.warning ?? '', /secundário/);
  assert.ok(alternatives(rec).includes('auto'));
});

test('a name keyword is an alternative when the primary CAE does not confirm it', () => {
  const rec = recommend(info({ caes: ['47111'], cae: '47111' }), 'Restaurante Bom Prato', '');
  assert.equal(rec.category, 'gerais');

  const restaurant = rec.alternatives.find(
    (alternative) => alternative.category === 'restauracao',
  );
  assert.ok(restaurant);
  assert.equal(restaurant.confidence, 'low');
  assert.match(restaurant.warning ?? '', /nome/i);
});

test('the activity description can add a sector the primary CAE does not', () => {
  const rec = recommend(
    info({
      caes: ['70220'],
      cae: '70220',
      activity: 'Consultoria. Atividades de restauração e hotelaria.',
    }),
    'SPIRALTOPIC',
    '',
  );
  assert.equal(rec.category, 'gerais');

  const restaurant = rec.alternatives.find(
    (alternative) => alternative.category === 'restauracao',
  );
  assert.ok(restaurant);
  assert.equal(restaurant.confidence, 'medium');
  assert.match(restaurant.warning ?? '', /atividade/i);
});

test('a secondary health CAE is offered with the portal warning', () => {
  const rec = recommend(
    info({
      caes: ['47784', '65120', '86906', '96093'],
      cae: '47784',
      activity: 'Produção e comercialização de cartões integrados de saúde e bem-estar.',
    }),
    'MED&CR',
    '',
  );
  assert.equal(rec.category, 'gerais');

  const health = rec.alternatives.find((alternative) => alternative.category === 'saude');
  assert.ok(health);
  assert.equal(health.confidence, 'medium');
  assert.match(health.warning ?? '', /portal/);
});

test('a pet supplier with a veterinary CAE is primary veterinary', () => {
  const rec = recommend(
    info({
      caes: ['47762', '46211', '47730', '75000'],
      cae: '47762',
      activity: 'Comercialização de alimentos para animais e medicamentos veterinários.',
    }),
    'ZU, PRODUTOS E SERVIÇOS PARA ANIMAIS, S.A.',
    '',
  );
  assert.equal(rec.category, 'veterinaria');
  assert.equal(rec.confidence, 'high');
  assert.deepEqual(alternatives(rec).sort(), ['gerais', 'saude']);
});

test('a multi-category supermarket keeps Outro as the safe primary', () => {
  const rec = recommend(
    info({
      caes: ['47111', '47610', '47730'],
      cae: '47111',
      activity: 'Comércio retalhista, cafés, restaurantes e padarias.',
    }),
    'MODELO CONTINENTE HIPERMERCADOS S.A.',
    '',
  );
  assert.equal(rec.category, 'gerais');
  assert.equal(rec.confidence, 'high');
  assert.ok(alternatives(rec).includes('educacao'));
  assert.ok(alternatives(rec).includes('saude'));
  assert.ok(alternatives(rec).includes('restauracao'));
});

test('the activity does not add noise when a CAE already maps', () => {
  const rec = recommend(
    info({ caes: ['56107'], cae: '56107', activity: 'Serviços de saúde e formação.' }),
    'Restaurante',
    '',
  );
  assert.equal(rec.category, 'restauracao');
  assert.deepEqual(rec.alternatives, []);
});

test('a taxi/TVDE company is Outro, with hospitality only as a hint', () => {
  const rec = recommend(
    info({
      caes: ['49320', '45110', '77110', '79120'],
      cae: '49320',
      activity: 'Transporte de passageiros em TVDE. Viagens turísticas com alojamento e alimentação.',
    }),
    'DINAMICA IMPERDIVEL',
    '',
  );
  assert.equal(rec.category, 'gerais');
  assert.equal(rec.confidence, 'high');
  assert.ok(!alternatives(rec).includes('passes'));
  assert.ok(alternatives(rec).includes('restauracao'));
});

test('a food retailer without a restaurant CAE still offers hospitality', () => {
  const rec = recommend(info({ caes: ['47112'], cae: '47112' }), 'Mini Mercado', '');
  assert.equal(rec.category, 'gerais');

  const restaurant = rec.alternatives.find(
    (alternative) => alternative.category === 'restauracao',
  );
  assert.ok(restaurant);
  assert.equal(restaurant.confidence, 'low');
  assert.match(restaurant.reason, /refeições prontas/);
});

test('without any CAE, Outro is the safe primary and the name is an alternative', () => {
  const rec = recommend(info({ name: 'Farmácia Central' }), 'Farmácia Central', '');
  assert.equal(rec.category, 'gerais');
  assert.equal(rec.confidence, 'medium');

  const health = rec.alternatives.find((alternative) => alternative.category === 'saude');
  assert.ok(health);
  assert.equal(health.confidence, 'low');
});

test('nothing known means Outro at low confidence', () => {
  const rec = recommend(null, 'Fornecedor Desconhecido', '');
  assert.equal(rec.category, 'gerais');
  assert.equal(rec.confidence, 'low');
  assert.match(rec.reason, /confirmar/);
});

test('health at 23% warns on the primary and on a health alternative', () => {
  const primary = recommend(info({ caes: ['86901'], cae: '86901' }), 'Clínica', 'IVA 23%');
  assert.equal(primary.category, 'saude');
  assert.match(primary.warning ?? '', /receita médica/);

  const withAlternative = recommend(
    info({ caes: ['47111', '86901'] }),
    'Supermercado',
    'IVA 23%',
  );
  const health = withAlternative.alternatives.find(
    (alternative) => alternative.category === 'saude',
  );
  assert.ok(health);
  assert.match(health.warning ?? '', /receita médica/);
});

test('the warning is only for health', () => {
  const rec = recommend(info({ caes: ['56101'], cae: '56101' }), 'Restaurante', 'IVA 23%');
  assert.equal(rec.category, 'restauracao');
  assert.equal(rec.warning, null);
});
