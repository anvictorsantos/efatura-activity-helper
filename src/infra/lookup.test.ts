import assert from 'node:assert/strict';
import test from 'node:test';

import type { Fetcher } from './lookup.ts';
import { lookupSupplier } from './lookup.ts';

const NIFPT_PAGE = `<html><head>
<meta name="description" content="O NIF 500330263 pertence à empresa Celeiro do Calhariz Auto-Serviço Alimentar Lda. Consulte" />
</head><body>
<a href="https://www.racius.com/celeiro-do-calhariz-auto-servico-alimentar-lda/">Informação Financeira</a>
</body></html>`;

const RACIUS_PAGE = `<!doctype html><html><head><title>Celeiro do Calhariz Auto Servico Alimentar Lda</title></head>
<body><p>NIF 500330263</p><p>CAE</p>
<a href='/supermercados/'><span>47111</span>&nbsp;-&nbsp;<span>Supermercados e hipermercados</span></a>
<a href='/outros/'><span>47112</span>&nbsp;-&nbsp;<span>Outros estabelecimentos</span></a>
<span class="ico-x">fim</span></body></html>`;

function recorder(handler: (url: string) => { status: number; text: string } | null): {
  fetch: Fetcher;
  calls: string[];
} {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    return handler(url) ?? { status: 404, text: '' };
  };
  return { fetch: fetcher, calls };
}

test('a configured nif.pt key answers first and nothing else is called', async () => {
  const { fetch, calls } = recorder((url) => {
    if (url.startsWith('https://www.nif.pt/')) {
      return {
        status: 200,
        text: JSON.stringify({
          result: 'success',
          records: { '500330263': { title: 'Celeiro', cae: '47111', activity: 'Retalho' } },
        }),
      };
    }
    return null;
  });

  const info = await lookupSupplier('500330263', 'Celeiro', { nifptKey: 'k', fetch });
  assert.equal(info.source, 'nif.pt');
  assert.deepEqual(info.caes, ['47111']);
  assert.equal(calls.length, 1);
});

test('the public nif.pt page supplies the exact Racius slug without a key', async () => {
  const { fetch, calls } = recorder((url) => {
    if (url === 'https://www.nif.pt/500330263/') return { status: 200, text: NIFPT_PAGE };
    if (url === 'https://www.racius.com/celeiro-do-calhariz-auto-servico-alimentar-lda/') {
      return { status: 200, text: RACIUS_PAGE };
    }
    return null;
  });

  const info = await lookupSupplier('500330263', 'CELEIRO CALHARIZ AUTO SERVICO ALIMENTAR LDA', {
    nifptKey: null,
    fetch,
  });
  assert.equal(info.source, 'racius');
  assert.deepEqual(info.caes, ['47111', '47112']);
  assert.ok(calls.includes('https://www.nif.pt/500330263/'));
  assert.ok(!calls.some((url) => url.startsWith('https://ec.europa.eu/')));
});

test('without a key, VIES names the company and Racius supplies the CAE', async () => {
  const { fetch } = recorder((url) => {
    if (url.startsWith('https://ec.europa.eu/')) {
      return {
        status: 200,
        text: JSON.stringify({
          isValid: true,
          name: 'Celeiro do Calhariz Auto Servico Alimentar Lda',
        }),
      };
    }
    if (url === 'https://www.racius.com/celeiro-do-calhariz-auto-servico-alimentar/') {
      return { status: 200, text: RACIUS_PAGE };
    }
    return null;
  });

  const info = await lookupSupplier('500330263', '', { nifptKey: null, fetch });
  assert.equal(info.source, 'racius');
  assert.deepEqual(info.caes, ['47111', '47112']);
  assert.match(info.note ?? '', /nif.pt: sem chave/);
});

test('a refused key is noted and the fallback still runs', async () => {
  const { fetch } = recorder((url) => {
    if (url.startsWith('https://www.nif.pt/')) {
      return { status: 200, text: JSON.stringify({ message: 'Key necessary.' }) };
    }
    if (url.startsWith('https://ec.europa.eu/')) {
      return { status: 200, text: JSON.stringify({ isValid: true, name: 'Empresa Lda' }) };
    }
    return null;
  });

  const info = await lookupSupplier('500330263', '', { nifptKey: 'bad', fetch });
  assert.equal(info.source, 'vies');
  assert.equal(info.name, 'Empresa Lda');
  assert.match(info.note ?? '', /chave recusada/);
});

test('an invalid NIF in VIES still allows the supplied name to be used', async () => {
  const { fetch } = recorder((url) => {
    if (url.startsWith('https://ec.europa.eu/')) {
      return { status: 200, text: JSON.stringify({ isValid: false, name: '---' }) };
    }
    return null;
  });

  const info = await lookupSupplier('500330263', 'Fornecedor Sem CAE', { nifptKey: null, fetch });
  assert.equal(info.source, 'name');
  assert.equal(info.name, 'Fornecedor Sem CAE');
  assert.match(info.note ?? '', /VIES: NIF inválido/);
});

test('nothing found is a state, not a throw', async () => {
  const { fetch } = recorder(() => null);
  const info = await lookupSupplier('500330263', '', { nifptKey: null, fetch });
  assert.equal(info.source, 'none');
  assert.equal(info.name, null);
  assert.deepEqual(info.caes, []);
  assert.match(info.note ?? '', /racius: não encontrado/);
});

test('the slug attempts are capped', async () => {
  const { fetch, calls } = recorder((url) => {
    if (url.startsWith('https://ec.europa.eu/')) {
      return { status: 200, text: JSON.stringify({ isValid: true, name: 'Muito Longa Empresa Lda' }) };
    }
    return null;
  });

  await lookupSupplier('500330263', '', { nifptKey: null, fetch, maxSlugTries: 1 });
  const raciusCalls = calls.filter((url) => url.includes('racius.com'));
  assert.equal(raciusCalls.length, 1);
});
