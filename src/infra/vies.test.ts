import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVies, viesUrl } from './vies.ts';

test('a valid response carries the registered name', () => {
  const answer = parseVies({
    isValid: true,
    name: 'CELEIRO CALHARIZ AUTO SERVICO ALIMENTAR LDA',
    address: 'LISBOA',
  });
  assert.equal(answer.valid, true);
  assert.equal(answer.name, 'CELEIRO CALHARIZ AUTO SERVICO ALIMENTAR LDA');
});

test('an invalid NIF is not valid even with a name', () => {
  const answer = parseVies({ isValid: false, name: 'X' });
  assert.equal(answer.valid, false);
  assert.equal(answer.name, 'X');
});

test('the "---" name means the company hid its name', () => {
  const answer = parseVies({ isValid: true, name: '---' });
  assert.equal(answer.valid, false);
  assert.equal(answer.name, null);
});

test('garbage is not valid', () => {
  assert.deepEqual(parseVies(null), { valid: false, name: null });
  assert.deepEqual(parseVies({}), { valid: false, name: null });
});

test('the URL targets the Portuguese VAT number', () => {
  assert.equal(
    viesUrl('500330263'),
    'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/500330263',
  );
});
