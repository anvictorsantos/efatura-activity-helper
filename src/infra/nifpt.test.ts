import assert from 'node:assert/strict';
import test from 'node:test';

import { isKeyNeeded, parseNifpt, parseNifptPage } from './nifpt.ts';

const PAGE = `<html><head>
<meta name="description" content="O NIF 500330263 pertence à empresa Celeiro do Calhariz Auto-Serviço Alimentar Lda. Consulte informação sobre os sócios" />
</head><body>
<a href="https://www.racius.com/celeiro-do-calhariz-auto-servico-alimentar-lda/" title="Celeiro do Calhariz Auto-Serviço Alimentar Lda - Informação Financeira">Informação Financeira</a>
</body></html>`;

test('the public page gives the exact Racius slug and the name', () => {
  const page = parseNifptPage(PAGE, '500330263');
  assert.equal(page.slug, 'celeiro-do-calhariz-auto-servico-alimentar-lda');
  assert.equal(page.name, 'Celeiro do Calhariz Auto-Serviço Alimentar Lda');
});

test('the description is a name fallback when the link has no title', () => {
  const html = `<meta name="description" content="O NIF 500330263 pertence à empresa Celeiro do Calhariz Lda. Mais" />`;
  assert.deepEqual(parseNifptPage(html, '500330263'), {
    name: 'Celeiro do Calhariz Lda',
    slug: null,
  });
});

test('a page about a different NIF is ignored', () => {
  assert.deepEqual(parseNifptPage(PAGE, '509442013'), { name: null, slug: null });
});

test('a page without any company data has no slug', () => {
  assert.deepEqual(parseNifptPage('<p>NIF 500330263</p>', '500330263'), {
    name: null,
    slug: null,
  });
});

const SAMPLE = {
  result: 'success',
  records: {
    '509442013': {
      nif: 509442013,
      title: 'Nexperience Lda',
      cae: '62010',
      activity: 'Desenvolvimento de software. Consultoria em informática.',
    },
  },
};

test('a successful record becomes SupplierInfo', () => {
  const info = parseNifpt(SAMPLE, '509442013');
  assert.ok(info);
  assert.equal(info.name, 'Nexperience Lda');
  assert.equal(info.cae, '62010');
  assert.deepEqual(info.caes, ['62010']);
  assert.match(info.activity ?? '', /software/);
  assert.equal(info.source, 'nif.pt');
});

test('the key error is recognised before parsing', () => {
  const refusal = { result: 'success', message: 'Key necessary. Contact www.nif.pt/contactos/api/' };
  assert.equal(isKeyNeeded(refusal), true);
  assert.equal(parseNifpt(refusal, '509442013'), null);
});

test('a missing record is null', () => {
  assert.equal(parseNifpt({ result: 'success', records: {} }, '509442013'), null);
  assert.equal(parseNifpt({}, '509442013'), null);
  assert.equal(parseNifpt(null, '509442013'), null);
});

test('a numeric CAE is accepted', () => {
  const info = parseNifpt(
    { records: { '509442013': { title: 'X', cae: 62010 } } },
    '509442013',
  );
  assert.equal(info?.cae, '62010');
});

test('an account without a CAE keeps the name and activity', () => {
  const info = parseNifpt(
    { records: { '509442013': { title: 'Particular', activity: 'Sem CAE' } } },
    '509442013',
  );
  assert.ok(info);
  assert.deepEqual(info.caes, []);
  assert.equal(info.cae, null);
});

test('an empty record is null', () => {
  assert.equal(parseNifpt({ records: { '509442013': {} } }, '509442013'), null);
});
