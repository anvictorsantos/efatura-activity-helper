import assert from 'node:assert/strict';
import test from 'node:test';

import { categoriesFromName, categoryFromName } from './heuristic.ts';

test('a supermarket name is not a repair shop', () => {
  assert.equal(
    categoryFromName('CELEIRO CALHARIZ AUTO SERVICO ALIMENTAR LDA')?.category ?? null,
    null,
  );
});

test('restaurants, cafés and hotels are hospitality', () => {
  assert.equal(categoryFromName('Restaurante O Ponto')?.category, 'restauracao');
  assert.equal(categoryFromName('Café Central')?.category, 'restauracao');
  assert.equal(categoryFromName('Hotel Mira Rio')?.category, 'restauracao');
});

test('pharmacies and clinics are health', () => {
  assert.equal(categoryFromName('Farmácia Central')?.category, 'saude');
  assert.equal(categoryFromName('Clínica da Luz')?.category, 'saude');
});

test('veterinary wins over the health words it contains', () => {
  assert.equal(categoryFromName('Clínica Veterinária do Tejo')?.category, 'veterinaria');
});

test('beauty, gyms, schools and housing are recognised', () => {
  assert.equal(categoryFromName('Cabeleireiro Zé')?.category, 'cabeleireiros');
  assert.equal(categoryFromName('Ginásio FitLife')?.category, 'ginasios');
  assert.equal(categoryFromName('Escola Básica do Vale')?.category, 'educacao');
  assert.equal(categoryFromName('Imobiliária Horizonte')?.category, 'habitacao');
});

test('repair words separate cars from motorcycles', () => {
  assert.equal(categoryFromName('Oficina Auto Silva')?.category, 'auto');
  assert.equal(categoryFromName('Moto Center')?.category, 'moto');
});

test('public transport and care homes are recognised', () => {
  assert.equal(categoryFromName('Comboios de Portugal')?.category, 'passes');
  assert.equal(categoryFromName('Lar de Idosos Esperança')?.category, 'lares');
});

test('an activity can mention more than one sector', () => {
  const found = categoriesFromName(
    'Serviços de consultoria. Atividades de restauração e hotelaria. Cuidados de saúde.',
  );
  assert.deepEqual(
    found.map((item) => item.category),
    ['restauracao', 'saude'],
  );
});

test('animals and pet are enough for veterinary', () => {
  assert.equal(categoryFromName('ZU, PRODUTOS E SERVIÇOS PARA ANIMAIS, S.A.')?.category, 'veterinaria');
  assert.equal(categoryFromName('Pet Care Centro')?.category, 'veterinaria');
});

test('a plain supermarket has no keyword', () => {
  assert.equal(categoryFromName('Supermercado Bom Dia'), null);
});

test('an empty name has no keyword', () => {
  assert.equal(categoryFromName('   '), null);
});
