import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeEntities } from './html.ts';

test('Portuguese named entities are decoded', () => {
  assert.equal(
    decodeEntities('restaura&ccedil;&atilde;o e sa&uacute;de'),
    'restauração e saúde',
  );
  assert.equal(decodeEntities('&Aacute;gua &amp; g&aacute;s'), 'Água & gás');
});

test('numeric entities and whitespace are handled', () => {
  assert.equal(decodeEntities('a&#231;&#227;o   e  p&#227;o'), 'ação e pão');
  assert.equal(decodeEntities('a&#xE7;&#xE3;o'), 'ação');
});

test('unknown entities are left alone', () => {
  assert.equal(decodeEntities('&notarealentity;'), '&notarealentity;');
});
