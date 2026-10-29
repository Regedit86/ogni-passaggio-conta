// Test della regola "in modalità test mai alle società", del controllo degli
// indirizzi nelle intestazioni MIME e della lettura degli indirizzi scritti a mano. Si eseguono con: node --test "test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinatari, leggiIndirizziManuali, segnapostoSenzaValore, segnapostoBloccanti, gruppiManuali } from '../js/destinatari.js';
import { MODELLO_PREDEFINITO } from '../js/modello-email.js';
import { costruisciMime } from '../js/google.js';

const societa = { email: 'segreteria@societa.it', email2: 'presidente@societa.it' };

test('in modalità test la mail va solo all\'indirizzo di test, senza CC', () => {
  assert.deepEqual(
    destinatari(societa, { test: true, emailTest: 'prova@example.com', ccSecondaria: true }),
    { a: 'prova@example.com', cc: '' },
  );
});

test('in modalità test senza indirizzo di test non parte niente', () => {
  assert.equal(destinatari(societa, { test: true, emailTest: '', ccSecondaria: false }), null);
});

test('in invio reale la mail va alla società, con CC solo se richiesto', () => {
  assert.deepEqual(
    destinatari(societa, { test: false, emailTest: 'prova@example.com', ccSecondaria: true }),
    { a: 'segreteria@societa.it', cc: 'presidente@societa.it' },
  );
  assert.deepEqual(
    destinatari(societa, { test: false, emailTest: 'prova@example.com', ccSecondaria: false }),
    { a: 'segreteria@societa.it', cc: '' },
  );
});

const mail = { da: 'mittente@example.com', a: 'segreteria@societa.it', oggetto: 'Invito', html: '<p>Ciao</p>', testo: 'Ciao' };

test('un indirizzo valido finisce nelle intestazioni', () => {
  const mime = costruisciMime({ ...mail, cc: 'presidente@societa.it' });
  assert.match(mime, /^To: segreteria@societa\.it\r$/m);
  assert.match(mime, /^Cc: presidente@societa\.it\r$/m);
});

for (const [descrizione, indirizzo] of [
  ['un a capo che aggiunge un Bcc', 'segreteria@societa.it\r\nBcc: altro@example.com'],
  ['più indirizzi separati da virgola', 'segreteria@societa.it, altro@example.com'],
  ['più indirizzi separati da punto e virgola', 'segreteria@societa.it;altro@example.com'],
  ['un indirizzo senza dominio', 'segreteria'],
]) {
  test(`indirizzo rifiutato: ${descrizione}`, () => {
    assert.throws(() => costruisciMime({ ...mail, a: indirizzo }), (e) => e.tipo === 'destinatario');
    assert.throws(() => costruisciMime({ ...mail, cc: indirizzo }), (e) => e.tipo === 'destinatario');
  });
}

test('indirizzi a mano: "Nome; email" oppure solo email, in minuscolo', () => {
  assert.deepEqual(leggiIndirizziManuali('Pro Loco Verona; Info@ProlocoVR.it\nmario.rossi@gmail.com\r\n  Comune di Padova ;  sport@comune.pd.it  '), {
    validi: [
      { nome: 'Pro Loco Verona', email: 'info@prolocovr.it' },
      { nome: '', email: 'mario.rossi@gmail.com' },
      { nome: 'Comune di Padova', email: 'sport@comune.pd.it' },
    ],
    nonValidi: [],
  });
});

test('indirizzi a mano: il nome può contenere ";", conta l\'ultimo', () => {
  assert.deepEqual(leggiIndirizziManuali('A.S.D. Uno; sezione due; a@b.it').validi, [{ nome: 'A.S.D. Uno; sezione due', email: 'a@b.it' }]);
});

test('indirizzi a mano: righe vuote ignorate, doppioni tenuti una volta', () => {
  const { validi, nonValidi } = leggiIndirizziManuali('\n a@b.it \n\nPrimo; A@B.IT\n   \n');
  assert.deepEqual(validi, [{ nome: '', email: 'a@b.it' }]);
  assert.deepEqual(nonValidi, []);
});

test('indirizzi a mano: righe non valide segnalate, senza fermare le altre', () => {
  const { validi, nonValidi } = leggiIndirizziManuali([
    'mario@',
    'a@b.it, c@d.it',
    'Nome; mario rossi@gmail.com',
    '<a@b.it>',
    'Solo un nome',
    'buono@esempio.it',
  ].join('\n'));
  assert.deepEqual(validi, [{ nome: '', email: 'buono@esempio.it' }]);
  assert.deepEqual(nonValidi, ['mario@', 'a@b.it, c@d.it', 'Nome; mario rossi@gmail.com', '<a@b.it>', 'Solo un nome']);
});

test('segnaposto senza valore per gli indirizzi a mano', () => {
  assert.deepEqual(segnapostoSenzaValore(MODELLO_PREDEFINITO.oggetto + MODELLO_PREDEFINITO.corpo), ['categoria']);
  assert.deepEqual(segnapostoSenzaValore('Gentile {{societa}}, {{ societa }}'), []);
  assert.deepEqual(segnapostoSenzaValore('{{ regione }} {{provincia}} {{regione}} {{girone}}'), ['regione', 'provincia', 'girone']);
  assert.deepEqual(segnapostoSenzaValore(''), []);
});

test('l\'invio si blocca solo se c\'è un indirizzo a mano e un segnaposto senza valore', () => {
  const societaDelFoglio = { email: 'a@b.it', squadre: [] };
  const aMano = { email: 'c@d.it', manuale: true, squadre: [] };
  const testo = 'Gentile {{societa}}, come società di {{categoria}}';
  assert.deepEqual(segnapostoBloccanti([societaDelFoglio, aMano], testo), ['categoria']);
  assert.deepEqual(segnapostoBloccanti([societaDelFoglio], testo), []);
  assert.deepEqual(segnapostoBloccanti([aMano], 'Gentile {{societa}}'), []);
  assert.deepEqual(segnapostoBloccanti([], testo), []);
  // invio.js passa oggetto + testo: un segnaposto nel solo oggetto blocca lo stesso
  assert.deepEqual(segnapostoBloccanti([aMano], 'Invito per {{regione}}' + 'Gentile {{societa}}'), ['regione']);
});

test('gruppi degli indirizzi a mano: forma, doppioni del foglio, già contattati', () => {
  const contattata = { data: '2026-10-01T10:00:00Z', email: 'vecchio@x.it' };
  const validi = [
    { nome: 'Pro Loco', email: 'pro@loco.it' },
    { nome: '', email: 'solo@email.it' },
    { nome: 'Doppione', email: 'segreteria@societa.it' },
    { nome: 'Vecchio', email: 'vecchio@x.it' },
  ];
  const opzioni = {
    emailDelFoglio: new Set(['segreteria@societa.it']),
    contattate: new Map([['vecchio@x.it', contattata]]),
    stati: { 'pro@loco.it': 'Interessata' },
  };

  const nascosti = gruppiManuali(validi, { ...opzioni, nascondi: true });
  assert.deepEqual(nascosti.gruppi.map((g) => g.email), ['pro@loco.it', 'solo@email.it']);
  assert.deepEqual(nascosti.giaSocieta, ['segreteria@societa.it']);
  assert.equal(nascosti.esclusi, 1);
  assert.deepEqual(nascosti.gruppi[0], {
    email: 'pro@loco.it',
    email2: '',
    manuale: true,
    squadre: [{ id: 'a-mano', societa: 'Pro Loco', categoria: 'a mano', regione: '', provincia: '', girone: '' }],
    contattata: undefined,
    stato: 'Interessata',
  });
  // senza nome, la "società" è l'indirizzo
  assert.equal(nascosti.gruppi[1].squadre[0].societa, 'solo@email.it');

  const tutti = gruppiManuali(validi, { ...opzioni, nascondi: false });
  assert.deepEqual(tutti.gruppi.map((g) => g.email), ['pro@loco.it', 'solo@email.it', 'vecchio@x.it']);
  assert.equal(tutti.gruppi[2].contattata, contattata);
  assert.equal(tutti.esclusi, 0);
});

test('un indirizzo a mano riceve la mail come una società, e in test solo l\'indirizzo di test', () => {
  const [g] = gruppiManuali([{ nome: 'Pro Loco', email: 'pro@loco.it' }], { emailDelFoglio: new Set(), contattate: new Map(), stati: {}, nascondi: true }).gruppi;
  assert.deepEqual(destinatari(g, { test: false, emailTest: 'prova@example.com', ccSecondaria: true }), { a: 'pro@loco.it', cc: '' });
  assert.deepEqual(destinatari(g, { test: true, emailTest: 'prova@example.com', ccSecondaria: true }), { a: 'prova@example.com', cc: '' });
});
