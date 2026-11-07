import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRacius, parseRaciusActivity, parseRaciusCaes } from './racius.ts';

const PAGE = `<!doctype html><html><head>
<title>Celeiro do Calhariz Auto-Serviço Alimentar Lda</title>
</head><body>
<p>NIF 500330263</p>
<p>CAE</p>
<ul class="t--d-blue">
  <li><div><a href='/supermercados-e-hipermercados/'><span class="t--orange">47111</span>&nbsp;-&nbsp;<span class="t--d-blue">Supermercados e hipermercados</span></a></div></li>
  <li><div><a href='/outros-estabelecimentos/'><span class="t--orange">47112</span>&nbsp;-&nbsp;<span class="t--d-blue">Outros estabelecimentos de produtos alimentares, bebidas ou tabaco</span></a></div></li>
</ul>
<span class="ico-ficheiro-texto">Eventos</span>
</body></html>`;

const PLAIN_PAGE = `<!doctype html><html><head><title>Vet Lda</title></head><body>
<p>NIF 500330263</p>
<p>CAE</p>
<p>75000 - Atividades veterinárias</p>
<div class="ico-info">mais</div>
</body></html>`;

test('the CAE list is read from the page', () => {
  assert.deepEqual(parseRaciusCaes(PAGE), ['47111', '47112']);
});

test('a plain-text CAE section is also read', () => {
  assert.deepEqual(parseRaciusCaes(PLAIN_PAGE), ['75000']);
});

test('the company is only trusted when its NIF is on the page', () => {
  const info = parseRacius(PAGE, '500330263');
  assert.ok(info);
  assert.equal(info.name, 'Celeiro do Calhariz Auto-Serviço Alimentar Lda');
  assert.equal(info.cae, '47111');
  assert.deepEqual(info.caes, ['47111', '47112']);
  assert.equal(info.source, 'racius');
});

test('a different NIF on the page is rejected', () => {
  assert.equal(parseRacius(PAGE, '509442013'), null);
});

test('a page without a CAE still reports the name', () => {
  const html = '<title>Sem CAE Lda</title><p>NIF 500330263</p>';
  const info = parseRacius(html, '500330263');
  assert.ok(info);
  assert.deepEqual(info.caes, []);
  assert.match(info.note ?? '', /sem CAE/);
});

test('duplicate codes are removed', () => {
  const html = `${PAGE}<p>CAE</p><a href='/x/'><span>47111</span>&nbsp;-&nbsp;<span>Outra vez</span></a>`;
  assert.deepEqual(parseRaciusCaes(html), ['47111', '47112']);
});

const ACTIVITY_PAGE = `<!doctype html><html><head><title>Spiraltopic</title></head><body>
<p>NIF 500330263</p>
<p>Atividade</p><p id="activity" class="t--d-blue">
  Consultoria. Atividades de restaura&ccedil;&atilde;o e hotelaria. Cuidados de sa&uacute;de.
</p><span class="ico-info">Acerca da Empresa</span>
</body></html>`;

test('the activity text is decoded and extracted', () => {
  assert.match(parseRaciusActivity(ACTIVITY_PAGE) ?? '', /restauração e hotelaria/);
  assert.match(parseRaciusActivity(ACTIVITY_PAGE) ?? '', /saúde/);

  const info = parseRacius(ACTIVITY_PAGE, '500330263');
  assert.ok(info);
  assert.match(info.activity ?? '', /consultoria/i);
});

test('a page without an activity section has no activity', () => {
  assert.equal(parseRaciusActivity(PAGE), null);
});
