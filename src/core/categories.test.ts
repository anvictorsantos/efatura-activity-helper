import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATEGORIES,
  categoryById,
  isCategoryLabel,
  matchCategoryText,
  normalizeText,
} from './categories.ts';

test('the page labels map to the canonical categories', () => {
  assert.equal(matchCategoryText('Saúde'), 'saude');
  assert.equal(matchCategoryText('Despesas de Educação'), 'educacao');
  assert.equal(matchCategoryText('Habitação'), 'habitacao');
  assert.equal(matchCategoryText('Despesas com Lares'), 'lares');
  assert.equal(matchCategoryText('Outro'), 'gerais');
  assert.equal(matchCategoryText('Reparação de Automóveis'), 'auto');
  assert.equal(matchCategoryText('Reparação de Motociclos'), 'moto');
  assert.equal(matchCategoryText('Restauração e Alojamento'), 'restauracao');
  assert.equal(matchCategoryText('Cabeleireiros'), 'cabeleireiros');
  assert.equal(matchCategoryText('Atividades Veterinárias'), 'veterinaria');
  assert.equal(matchCategoryText('Passes Mensais'), 'passes');
  assert.equal(matchCategoryText('Ginásios'), 'ginasios');
});

test('accents and case do not matter', () => {
  assert.equal(matchCategoryText('  SAUDE  '), 'saude');
  assert.equal(matchCategoryText('ginasios'), 'ginasios');
});

test('a column heading is not a category', () => {
  assert.equal(matchCategoryText('Atividade de Realização da Aquisição'), null);
  assert.equal(matchCategoryText('Emitente'), null);
});

test('a full phrase still finds its category', () => {
  assert.equal(matchCategoryText('Despesas com ginásios'), 'ginasios');
  assert.equal(matchCategoryText('Despesas Gerais Familiares'), 'gerais');
});

test('an option label with a suffix still matches', () => {
  assert.equal(matchCategoryText('Saúde - 23%'), 'saude');
  assert.equal(matchCategoryText('Outro (despesas gerais)'), 'gerais');
  assert.equal(matchCategoryText('Lares de idosos'), 'lares');
});

test('every category has a label, aliases and a hint', () => {
  for (const category of CATEGORIES) {
    assert.ok(category.label.length > 0);
    assert.ok(category.aliases.length > 0);
    assert.ok(category.hint.length > 20);
    assert.equal(categoryById(category.id).label, category.label);
  }
});

test('isCategoryLabel is an exact match', () => {
  assert.equal(isCategoryLabel('Ginásios', 'ginasios'), true);
  assert.equal(isCategoryLabel('Despesas com ginásios', 'ginasios'), false);
});

test('normalizeText strips accents and punctuation', () => {
  assert.equal(normalizeText('Restauração & Alojamento!'), 'restauracao alojamento');
});
