// Test dei controlli sugli allegati e della conversione in base64.
// Si eseguono con: node --test "test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valutaAllegati, byteInBase64, formatoDimensione, LIMITE_ALLEGATI } from '../js/allegati.js';

const MB = 1024 * 1024;

test('il limite è di 10 MB in totale', () => {
  assert.equal(LIMITE_ALLEGATI, 10 * MB);
  assert.deepEqual(valutaAllegati([], [{ nome: 'a.pdf', dimensione: 10 * MB }]).scartati, []);
  const oltre = valutaAllegati([], [{ nome: 'a.pdf', dimensione: 10 * MB + 1 }]);
  assert.deepEqual(oltre.accettati, []);
  assert.match(oltre.scartati[0].motivo, /limite di 10 MB/);
});

test('il limite conta gli allegati già presenti e quelli accettati nella stessa scelta', () => {
  const esistenti = [{ nome: 'grande.pdf', dimensione: 8 * MB }];
  const nuovi = [{ nome: 'uno.pdf', dimensione: 1.5 * MB }, { nome: 'due.pdf', dimensione: 1.5 * MB }];
  const { accettati, scartati } = valutaAllegati(esistenti, nuovi);
  assert.deepEqual(accettati.map((f) => f.nome), ['uno.pdf']);
  assert.deepEqual(scartati.map((f) => f.nome), ['due.pdf']);
  assert.match(scartati[0].motivo, /limite/);
});

test('estensioni bloccate da Gmail, anche in maiuscolo', () => {
  const { accettati, scartati } = valutaAllegati([], [
    { nome: 'setup.EXE', dimensione: 10 },
    { nome: 'script.js', dimensione: 10 },
    { nome: 'volantino.pdf', dimensione: 10 },
  ]);
  assert.deepEqual(accettati.map((f) => f.nome), ['volantino.pdf']);
  assert.deepEqual(scartati, [
    { nome: 'setup.EXE', motivo: 'Gmail non accetta file .exe' },
    { nome: 'script.js', motivo: 'Gmail non accetta file .js' },
  ]);
});

test('file vuoti e doppioni scartati, senza distinguere le maiuscole', () => {
  const { accettati, scartati } = valutaAllegati([{ nome: 'Volantino.pdf', dimensione: 10 }], [
    { nome: 'vuoto.txt', dimensione: 0 },
    { nome: 'volantino.PDF', dimensione: 10 },
    { nome: 'nuovo.pdf', dimensione: 10 },
    { nome: 'NUOVO.pdf', dimensione: 10 },
  ]);
  assert.deepEqual(accettati.map((f) => f.nome), ['nuovo.pdf']);
  assert.deepEqual(scartati, [
    { nome: 'vuoto.txt', motivo: 'il file è vuoto' },
    { nome: 'volantino.PDF', motivo: 'è già allegato' },
    { nome: 'NUOVO.pdf', motivo: 'è già allegato' },
  ]);
});

test('i dati extra dei file accettati vengono conservati', () => {
  const file = { nome: 'a.pdf', dimensione: 5, file: 'riferimento' };
  assert.equal(valutaAllegati([], [file]).accettati[0], file);
});

test('byteInBase64 su byte noti, anche oltre un blocco da 32 KB', () => {
  assert.equal(byteInBase64(new Uint8Array([77, 97, 110])), 'TWFu');
  assert.equal(byteInBase64(new Uint8Array([])), '');
  const grande = new Uint8Array(0x8000 * 2 + 5).map((_, i) => i % 256);
  assert.equal(byteInBase64(grande), Buffer.from(grande).toString('base64'));
});

test('formatoDimensione', () => {
  assert.equal(formatoDimensione(10 * MB), '10 MB');
  assert.equal(formatoDimensione(1.25 * MB), '1,3 MB');
  assert.equal(formatoDimensione(350 * 1024), '350 KB');
  assert.equal(formatoDimensione(10), '1 KB');
});
