import assert from 'node:assert/strict';
import test from 'node:test';

import { caeSummary, categoryForCae, classifyCaes, digitsOfCae } from './cae.ts';

test('repair shops are told apart from motorcycle shops', () => {
  assert.equal(categoryForCae('45200')?.category, 'auto');
  assert.equal(categoryForCae('45401')?.category, 'moto');
  assert.equal(categoryForCae('45402')?.category, 'moto');
});

test('health covers clinics, pharmacies and optics', () => {
  assert.equal(categoryForCae('86901')?.category, 'saude');
  assert.equal(categoryForCae('86230')?.category, 'saude');
  assert.equal(categoryForCae('47730')?.category, 'saude');
  assert.equal(categoryForCae('47782')?.category, 'saude');
});

test('education covers schools, bookshops and child care', () => {
  assert.equal(categoryForCae('85591')?.category, 'educacao');
  assert.equal(categoryForCae('85201')?.category, 'educacao');
  assert.equal(categoryForCae('47610')?.category, 'educacao');
  assert.equal(categoryForCae('88910')?.category, 'educacao');
});

test('a bakery counter is hospitality', () => {
  assert.equal(categoryForCae('47240')?.category, 'restauracao');
});

test('office equipment is not an optical health expense', () => {
  assert.equal(categoryForCae('47781'), null);
});

test('housing, care homes and social support are distinct', () => {
  assert.equal(categoryForCae('68201')?.category, 'habitacao');
  assert.equal(categoryForCae('87301')?.category, 'lares');
  assert.equal(categoryForCae('88101')?.category, 'lares');
});

test('hospitality covers hotels and restaurants', () => {
  assert.equal(categoryForCae('55111')?.category, 'restauracao');
  assert.equal(categoryForCae('56101')?.category, 'restauracao');
  assert.equal(categoryForCae('56301')?.category, 'restauracao');
});

test('beauty, veterinary, transport and gyms have their own buckets', () => {
  assert.equal(categoryForCae('96021')?.category, 'cabeleireiros');
  assert.equal(categoryForCae('96022')?.category, 'cabeleireiros');
  assert.equal(categoryForCae('75000')?.category, 'veterinaria');
  assert.equal(categoryForCae('47762')?.category, 'veterinaria');
  assert.equal(categoryForCae('49310')?.category, 'passes');
  assert.equal(categoryForCae('49391')?.category, 'passes');
  assert.equal(categoryForCae('93130')?.category, 'ginasios');
});

test('a taxi or an airline is not a monthly public-transport pass', () => {
  assert.equal(categoryForCae('49320'), null);
  assert.equal(categoryForCae('51101'), null);
});

test('a supermarket CAE is a general expense, not a special category', () => {
  assert.equal(categoryForCae('47111'), null);
  assert.equal(categoryForCae('47112'), null);
});

test('a secondary CAE can rescue an unmapped primary', () => {
  const match = classifyCaes(['47111', '45200']);
  assert.equal(match?.category, 'auto');
  assert.equal(match?.code, '45200');
});

test('nothing maps when every code is generic', () => {
  assert.equal(classifyCaes(['47111', '47112']), null);
  assert.equal(classifyCaes([]), null);
});

test('short or empty codes are ignored', () => {
  assert.equal(categoryForCae(''), null);
  assert.equal(categoryForCae('8'), null);
});

test('dots and spaces are stripped', () => {
  assert.equal(digitsOfCae('452.00'), '45200');
  assert.equal(categoryForCae(' 452 00 ')?.category, 'auto');
});

test('the summary keeps the code and its name', () => {
  assert.match(caeSummary(['56101']), /56101/);
  assert.match(caeSummary(['56101']), /restaurantes/);
});
