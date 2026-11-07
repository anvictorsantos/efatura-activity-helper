import assert from 'node:assert/strict';
import test from 'node:test';

import { slugCandidates, slugify } from './slug.ts';

test('accents and punctuation become a slug', () => {
  assert.equal(
    slugify('Celeiro do Calhariz Auto-Serviço Alimentar Lda'),
    'celeiro-do-calhariz-auto-servico-alimentar-lda',
  );
  assert.equal(slugify('A & B, Lda.'), 'a-e-b-lda');
});

test('the legal form is also offered with and without its suffix', () => {
  const slugs = slugCandidates('Celeiro do Calhariz Auto-Serviço Alimentar Lda');
  assert.ok(slugs.includes('celeiro-do-calhariz-auto-servico-alimentar-lda'));
  assert.ok(slugs.includes('celeiro-do-calhariz-auto-servico-alimentar'));
});

test('a one-word company still gets useful candidates', () => {
  const slugs = slugCandidates('Nexperience Lda');
  assert.ok(slugs.includes('nexperience'));
  assert.ok(slugs.includes('nexperience-lda'));
});

test('an empty name has no candidates', () => {
  assert.deepEqual(slugCandidates('   '), []);
});
