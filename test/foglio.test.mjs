// Test della sostituzione dell'elenco società: un solo batchUpdate che prima
// svuota la scheda Squadre e poi scrive intestazione e righe.
// Si eseguono con: node --test "test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTESTAZIONI, richiesteSostituzioneSquadre } from '../js/foglio.js';

const squadra = {
  regione: 'Veneto', categoria: 'Eccellenza', girone: 'A', societa: 'A.S.D. Esempio', provincia: 'VR',
  sede: 'Via Roma 1', telefono: '045 000000', email: 'info@esempio.it', email2: '', sito: 'https://esempio.it', scheda: '',
};

const testi = (riga) => riga.values.map((c) => c.userEnteredValue.stringValue);

test('prima svuota i valori della scheda indicata, poi scrive', () => {
  const richieste = richiesteSostituzioneSquadre(42, [squadra]);
  assert.equal(richieste.length, 2);
  const [svuota, scrivi] = richieste;
  assert.deepEqual(svuota, { updateCells: { range: { sheetId: 42 }, fields: 'userEnteredValue' } });
  assert.equal(scrivi.appendCells.sheetId, 42);
  assert.equal(scrivi.appendCells.fields, 'userEnteredValue');
});

test('scrive l\'intestazione e poi una riga per società, nell\'ordine delle colonne', () => {
  const [, scrivi] = richiesteSostituzioneSquadre(0, [squadra, { ...squadra, societa: 'U.S. Altra', email: 'altra@esempio.it' }]);
  const righe = scrivi.appendCells.rows;
  assert.equal(righe.length, 3);
  // intestazione scritta per esteso: è il contratto con il foglio condiviso e con converti_csv.py
  assert.deepEqual(testi(righe[0]), ['Regione', 'Categoria', 'Girone', 'Società', 'Provincia', 'Sede', 'Telefono', 'Email', 'Email secondaria', 'Sito', 'Scheda tuttocampo']);
  assert.deepEqual(testi(righe[1]), ['Veneto', 'Eccellenza', 'A', 'A.S.D. Esempio', 'VR', 'Via Roma 1', '045 000000', 'info@esempio.it', '', 'https://esempio.it', '']);
  assert.equal(testi(righe[2])[3], 'U.S. Altra');
  assert.equal(testi(righe[2])[7], 'altra@esempio.it');
});

test('campi mancanti diventano celle vuote, i numeri restano numeri', () => {
  const [, scrivi] = richiesteSostituzioneSquadre(0, [{ societa: 'Solo nome', girone: 3 }]);
  const valori = scrivi.appendCells.rows[1].values.map((c) => c.userEnteredValue);
  assert.equal(valori.length, INTESTAZIONI.Squadre.length);
  assert.deepEqual(valori[2], { numberValue: 3 });
  assert.deepEqual(valori[3], { stringValue: 'Solo nome' });
  assert.deepEqual(valori[0], { stringValue: '' });
});

test('con elenco vuoto scrive solo l\'intestazione', () => {
  const [, scrivi] = richiesteSostituzioneSquadre(0, []);
  assert.equal(scrivi.appendCells.rows.length, 1);
});
