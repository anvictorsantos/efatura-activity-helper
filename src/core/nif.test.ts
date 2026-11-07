import assert from 'node:assert/strict';
import test from 'node:test';

import { extractNif, findNifs, isValidNif, normalizeNif } from './nif.ts';

test('the supplier NIF passes the mod-11 check', () => {
  assert.equal(isValidNif('500330263'), true);
  assert.equal(isValidNif('509442013'), true);
});

test('a wrong check digit is rejected', () => {
  assert.equal(isValidNif('500330264'), false);
  assert.equal(isValidNif('123456788'), false);
});

test('NIFs never start with 4', () => {
  assert.equal(isValidNif('400000000'), false);
});

test('spaces and dots are ignored', () => {
  assert.equal(normalizeNif('500 330 263'), '500330263');
  assert.equal(isValidNif('500.330.263'), true);
  assert.equal(normalizeNif('50033026'), null);
});

test('extractNif reads the emitente line', () => {
  assert.equal(
    extractNif('CELEIRO CALHARIZ AUTO SERVICO ALIMENTAR LDA - NIF 500 330 263'),
    '500330263',
  );
});

test('numbers that fail the check are not NIFs', () => {
  assert.deepEqual(findNifs('tel 213 456 789 nif 500330263'), ['500330263']);
});

test('findNifs keeps order and removes duplicates', () => {
  assert.deepEqual(findNifs('500330263 e outra vez 500330263'), ['500330263']);
});
