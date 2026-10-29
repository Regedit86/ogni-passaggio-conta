// Test della richiesta di invio a Gmail, con fetch e sessione finti: nessuna
// chiamata vera a Google.
// Si eseguono con: node --test "test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Gli stessi permessi che chiede google.js: una sessione con permessi diversi viene scartata.
const SCOPE = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/spreadsheets openid email profile';
const memoria = new Map([['opc.sessione', JSON.stringify({
  token: 'token-finto', email: 'mittente@example.com', impronta: 'impronta', nome: 'Mittente', scade: Date.now() + 3600 * 1000, scope: SCOPE,
})]]);
globalThis.sessionStorage = {
  getItem: (k) => memoria.get(k) ?? null,
  setItem: (k, v) => memoria.set(k, v),
  removeItem: (k) => memoria.delete(k),
};

const chiamate = [];
let risposta = () => new Response('{}');
globalThis.fetch = async (url, opzioni) => {
  chiamate.push({ url, opzioni });
  return risposta();
};

// La sessione si legge quando il modulo viene caricato: import dopo aver preparato sessionStorage.
const { inviaEmail, costruisciMime, utente } = await import('../js/google.js');

const messaggio = { nomeDa: 'Ogni Passaggio Conta', a: 'societa@example.com', oggetto: 'Invito', html: '<p>Ciao</p>', testo: 'Ciao', allegati: [{ nome: 'a.pdf', tipo: 'application/pdf', base64: 'JVBERi0=' }] };
const json = (corpo, status) => () => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

test('la mail parte come JSON { raw } con il MIME in base64url (non l\'endpoint di upload, che il browser non può leggere)', async () => {
  risposta = json({ id: 'msg-1' }, 200);
  const casuale = Math.random;
  Math.random = () => 0.5; // stesso confine MIME nelle due costruzioni
  try {
    const esito = await inviaEmail(messaggio);
    assert.deepEqual(esito, { id: 'msg-1' });
    const [{ url, opzioni }] = chiamate.splice(0);
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(opzioni.method, 'POST');
    assert.deepEqual(opzioni.headers, { Authorization: 'Bearer token-finto', 'Content-Type': 'application/json' });
    const { raw } = JSON.parse(opzioni.body);
    assert.match(raw, /^[A-Za-z0-9_-]+$/, 'base64url senza padding');
    assert.equal(Buffer.from(raw, 'base64url').toString('utf8'), costruisciMime({ ...messaggio, da: 'mittente@example.com' }));
  } finally {
    Math.random = casuale;
  }
});

test('limite di invio (429) ed errore di destinatario (400) hanno il loro tipo', async () => {
  risposta = json({ error: { message: 'Rate limit exceeded' } }, 429);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'limite');
  risposta = json({ error: { message: 'Invalid To header' } }, 400);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'destinatario');
  // un messaggio troppo grande non è il limite giornaliero: non va presentato come tale
  risposta = json({ error: { message: 'Message too large, size limit exceeded' } }, 400);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'altro');
  risposta = json({ error: { message: 'User-rate limit exceeded', errors: [{ reason: 'userRateLimitExceeded' }] } }, 403);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'limite');
  risposta = json({ error: { message: 'Backend Error' } }, 500);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'altro' && e.message === 'Backend Error');
  assert.ok(utente(), 'questi errori non chiudono la sessione');
});

test('un 401 chiude la sessione e chiede di riaccedere', async () => {
  risposta = json({ error: { message: 'Invalid Credentials' } }, 401);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'sessione');
  assert.equal(utente(), null);
  assert.equal(memoria.has('opc.sessione'), false);
  // senza sessione non parte nessuna richiesta
  chiamate.splice(0);
  await assert.rejects(inviaEmail(messaggio), (e) => e.tipo === 'sessione');
  assert.equal(chiamate.length, 0);
});
