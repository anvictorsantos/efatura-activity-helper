import assert from 'node:assert/strict';
import test from 'node:test';

import {
  categoryForSector,
  categoryFromControl,
  isSectorValue,
  preferredSector,
} from './sectors.ts';

test('each category has the portal\'s own code', () => {
  assert.equal(preferredSector('auto'), 'C01');
  assert.equal(preferredSector('moto'), 'C02');
  assert.equal(preferredSector('restauracao'), 'C03');
  assert.equal(preferredSector('cabeleireiros'), 'C04');
  assert.equal(preferredSector('saude'), 'C05');
  assert.equal(preferredSector('educacao'), 'C06');
  assert.equal(preferredSector('habitacao'), 'C07');
  assert.equal(preferredSector('lares'), 'C08');
  assert.equal(preferredSector('veterinaria'), 'C09');
  assert.equal(preferredSector('passes'), 'C10');
  assert.equal(preferredSector('ginasios'), 'C11');
  assert.equal(preferredSector('gerais'), 'C99');
});

test('the portal codes map back to categories', () => {
  assert.equal(categoryForSector('C05'), 'saude');
  assert.equal(categoryForSector('c26'), 'educacao');
  assert.equal(categoryForSector('C13'), 'educacao');
  assert.equal(categoryForSector('C12'), 'gerais');
  assert.equal(categoryForSector('C99'), 'gerais');
  assert.equal(categoryForSector('C00'), null);
});

test('the button value decides before its visible label', () => {
  assert.equal(categoryFromControl('C05', 'Saúde'), 'saude');
  assert.equal(categoryFromControl('C11', 'Ginásios'), 'ginasios');
  assert.equal(categoryFromControl('C07', 'Imóveis'), 'habitacao');
  assert.equal(categoryFromControl('C01', 'Manutenção e reparação de veículos automóveis'), 'auto');
  assert.equal(categoryFromControl('C13', 'Comércio a retalho de livros'), 'educacao');
  assert.equal(categoryFromControl('C99', 'Outro'), 'gerais');
  assert.equal(categoryFromControl('', 'Outro'), 'gerais');
});

test('only a C plus two digits is a sector value', () => {
  assert.equal(isSectorValue('C01'), true);
  assert.equal(isSectorValue(' c11 '), true);
  assert.equal(isSectorValue('C1'), false);
  assert.equal(isSectorValue('01'), false);
  assert.equal(isSectorValue(''), false);
});
