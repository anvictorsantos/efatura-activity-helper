import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSupplierInfo } from './browser.ts';

test('a stored result is re-validated, not trusted', () => {
  const info = validateSupplierInfo(
    {
      name: '  Celeiro  ',
      cae: '47111',
      caes: ['47111', 'not-a-code', 7],
      activity: ' Retalho ',
      source: 'racius',
      note: ' ok ',
    },
    '500330263',
  );

  assert.ok(info);
  assert.equal(info.nif, '500330263');
  assert.equal(info.name, 'Celeiro');
  assert.equal(info.cae, '47111');
  assert.deepEqual(info.caes, ['47111']);
  assert.equal(info.activity, 'Retalho');
  assert.equal(info.source, 'racius');
  assert.equal(info.note, 'ok');
});

test('an unknown source invalidates the record', () => {
  assert.equal(validateSupplierInfo({ source: 'somewhere' }, '500330263'), null);
  assert.equal(validateSupplierInfo({}, '500330263'), null);
  assert.equal(validateSupplierInfo(null, '500330263'), null);
});

test('the CAE falls back to the first valid code', () => {
  const info = validateSupplierInfo({ source: 'vies', caes: ['75000'] }, '500330263');
  assert.equal(info?.cae, '75000');
});

test('missing arrays and strings become empty values', () => {
  const info = validateSupplierInfo({ source: 'none' }, '500330263');
  assert.ok(info);
  assert.deepEqual(info.caes, []);
  assert.equal(info.cae, null);
  assert.equal(info.name, null);
  assert.equal(info.activity, null);
  assert.equal(info.note, null);
});
