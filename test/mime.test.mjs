// Test della costruzione del messaggio MIME con immagini in linea e allegati.
// Si eseguono con: node --test "test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costruisciMime } from '../js/google.js';

const base = { da: 'mittente@example.com', nomeDa: 'Ogni Passaggio Conta', a: 'societa@example.com', oggetto: 'Invito', html: '<p>Ciao</p>', testo: 'Ciao' };
const logo = { cid: 'logo-opc', tipo: 'image/png', nome: 'logo.png', base64: 'iVBORw0KGgo=' };
const pdf = { nome: 'volantino.pdf', tipo: 'application/pdf', base64: 'JVBERi0xLjQ=' };

// I Content-Type nell'ordine in cui compaiono.
const tipi = (mime) => [...mime.matchAll(/^Content-Type: ([^;\r\n]+)/gm)].map((m) => m[1]);
// Le intestazioni del messaggio (prima della prima riga vuota).
const intestazioni = (mime) => mime.split('\r\n\r\n')[0].split('\r\n');

test('senza allegati la struttura resta quella di prima', () => {
  assert.deepEqual(tipi(costruisciMime(base)), ['multipart/alternative', 'text/plain', 'text/html']);
  assert.deepEqual(tipi(costruisciMime({ ...base, immagini: [logo] })),
    ['multipart/related', 'multipart/alternative', 'text/plain', 'text/html', 'image/png']);
  assert.ok(!costruisciMime({ ...base, immagini: [logo] }).includes('multipart/mixed'));
});

test('senza allegati: intestazioni del messaggio e delle parti', () => {
  const mime = costruisciMime({ ...base, cc: 'cc@example.com', replyTo: 'risposte@example.com', immagini: [logo] });
  assert.deepEqual(intestazioni(mime).slice(0, 6), [
    'From: Ogni Passaggio Conta <mittente@example.com>',
    'To: societa@example.com',
    'Cc: cc@example.com',
    'Reply-To: risposte@example.com',
    'Subject: Invito',
    'MIME-Version: 1.0',
  ]);
  for (const tipo of ['text/plain', 'text/html']) {
    assert.ok(mime.includes(`Content-Type: ${tipo}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n`), tipo);
  }
  assert.ok(mime.includes(`Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('Ciao').toString('base64')}\r\n`));
  assert.ok(mime.includes('Content-Type: image/png; name="logo.png"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <logo-opc>\r\nContent-Disposition: inline; filename="logo.png"\r\n\r\niVBORw0KGgo='));
});

test('allegati lunghi spezzati su righe da 76 caratteri', () => {
  const lungo = Buffer.from(new Uint8Array(5000).map((_, i) => i % 256)).toString('base64');
  const mime = costruisciMime({ ...base, allegati: [{ ...pdf, base64: lungo }] });
  assert.ok(mime.split('\r\n').every((r) => r.length <= 76), 'nessuna riga oltre 76 caratteri');
  assert.ok(mime.includes(lungo.slice(0, 76) + '\r\n' + lungo.slice(76, 152) + '\r\n'));
});

test('con allegati la radice è multipart/mixed e il file è un attachment', () => {
  const mime = costruisciMime({ ...base, allegati: [pdf] });
  assert.deepEqual(tipi(mime), ['multipart/mixed', 'multipart/alternative', 'text/plain', 'text/html', 'application/pdf']);
  assert.ok(mime.includes('Content-Type: application/pdf; name="volantino.pdf"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="volantino.pdf"\r\n\r\nJVBERi0xLjQ='));
  const confine = mime.match(/multipart\/mixed; boundary="([^"]+)"/)[1];
  assert.ok(mime.trimEnd().endsWith(`--${confine}--`));
  assert.equal(mime.split(`--${confine}\r\n`).length - 1, 2); // corpo + 1 allegato
});

test('logo e allegati: mixed > related > alternative', () => {
  const mime = costruisciMime({ ...base, immagini: [logo], allegati: [pdf, { ...pdf, nome: 'due.pdf' }] });
  assert.deepEqual(tipi(mime),
    ['multipart/mixed', 'multipart/related', 'multipart/alternative', 'text/plain', 'text/html', 'image/png', 'application/pdf', 'application/pdf']);
  const related = mime.match(/multipart\/related; type="multipart\/alternative"; boundary="([^"]+)"/)[1];
  const mixed = mime.match(/multipart\/mixed; boundary="([^"]+)"/)[1];
  // il related si chiude prima che inizino gli allegati
  assert.ok(mime.indexOf(`--${related}--`) < mime.indexOf('name="volantino.pdf"'));
  assert.ok(mime.indexOf(`--${related}--`) > mime.indexOf(`--${mixed}\r\n`));
});

test('un nome di file con a capo o virgolette non aggiunge intestazioni', () => {
  const mime = costruisciMime({ ...base, allegati: [{ ...pdf, nome: 'a"\r\nBcc: spia@example.com\r\n.pdf' }] });
  assert.ok(!/^Bcc:/m.test(mime));
  assert.ok(mime.includes('filename="aBcc: spia@example.com.pdf"'));
  assert.ok(!intestazioni(mime).some((r) => r.startsWith('Bcc')));
});

test('nome non ASCII codificato, nome vuoto e tipo sospetto sostituiti', () => {
  const mime = costruisciMime({ ...base, allegati: [
    { ...pdf, nome: 'società è.pdf' },
    { ...pdf, nome: '\r\n', tipo: 'text/html; charset=x\r\nBcc: a@b.it' },
  ] });
  assert.ok(mime.includes(`filename="=?UTF-8?B?${Buffer.from('società è.pdf').toString('base64')}?="`));
  assert.ok(mime.includes('Content-Type: application/octet-stream; name="allegato"'));
  assert.ok(!/^Bcc:/m.test(mime));
});

test('il messaggio è solo ASCII anche con oggetto, mittente e testo accentati', () => {
  const mime = costruisciMime({ ...base, nomeDa: 'Società', oggetto: 'Perché giocare', testo: 'àèìòù', html: '<p>àèìòù</p>', allegati: [{ ...pdf, nome: 'è.pdf' }] });
  assert.ok(/^[\x00-\x7f]*$/.test(mime));
});
