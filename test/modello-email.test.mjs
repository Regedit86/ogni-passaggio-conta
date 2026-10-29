// Test dei marcatori di formattazione della mail (HTML e solo testo).
// Si eseguono con: node --test "test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlEmail, testoSemplice, MODELLO_PREDEFINITO } from '../js/modello-email.js';

// Solo il corpo della mail, senza testata e piè di pagina.
const corpo = (testo, dati) => htmlEmail(testo, { dati }).match(/<td style="padding:16px 36px 12px[^>]*>(.*?)<\/td>/s)[1];
// Solo testo senza la firma finale.
const semplice = (testo, dati) => testoSemplice(testo, dati).split('\n\n--\n')[0];

test('grassetto, corsivo e sottolineato', () => {
  assert.equal(corpo('**forte** *piano* __sotto__'),
    '<p style="margin:0 0 16px"><strong style="color:#6D586F">forte</strong> <em>piano</em> <u>sotto</u></p>');
  assert.equal(semplice('**forte** *piano* __sotto__'), 'forte piano sotto');
});

test('un asterisco attaccato a una parola non diventa corsivo (capitan* nel testo predefinito)', () => {
  const html = corpo(MODELLO_PREDEFINITO.corpo);
  assert.ok(html.includes('Fascia da capitan*, e il nostro'));
  assert.ok(!html.includes('<em>'));
  assert.ok(semplice(MODELLO_PREDEFINITO.corpo).includes('Fascia da capitan*, e il nostro'));
});

test('link con testo: solo http, https e mailto', () => {
  assert.equal(corpo('vedi [il sito](https://esempio.it/a)'),
    '<p style="margin:0 0 16px">vedi <a href="https://esempio.it/a" style="color:#D4204D">il sito</a></p>');
  assert.equal(semplice('vedi [il sito](https://esempio.it/a)'), 'vedi il sito (https://esempio.it/a)');
  assert.ok(corpo('[scrivi](mailto:a@b.it)').includes('<a href="mailto:a@b.it"'));
  const pericoloso = corpo('[clic](javascript:alert(1))');
  assert.ok(!pericoloso.includes('<a'));
  assert.ok(pericoloso.includes('[clic](javascript:alert(1))'));
});

test('i marcatori non toccano gli indirizzi, nudi o dentro un link', () => {
  const nudo = corpo('modulo: https://forms.gle/a__b__c*x* fine');
  assert.ok(nudo.includes('<a href="https://forms.gle/a__b__c*x*" style="color:#D4204D">https://forms.gle/a__b__c*x*</a>'));
  assert.ok(!nudo.includes('<u>') && !nudo.includes('<em>'));
  const conTesto = corpo('[iscrizioni](https://x.it/f?a=__x__&b=*y*)');
  assert.ok(conTesto.includes('<a href="https://x.it/f?a=__x__&amp;b=*y*"'));
  assert.ok(!conTesto.includes('<u>') && !conTesto.includes('<em>'));
  // un URL dentro un link con testo non diventa un secondo link
  assert.equal((corpo('[https://a.it](https://a.it)').match(/<a /g) || []).length, 1);
});

test('i segnaposto negli indirizzi vengono sostituiti e codificati', () => {
  const dati = { societa: 'A.S.D. Stella & co' };
  assert.ok(corpo('modulo: https://modulo.it/?s={{societa}}', dati)
    .includes('<a href="https://modulo.it/?s=A.S.D.%20Stella%20%26%20co" style="color:#D4204D">https://modulo.it/?s=A.S.D.%20Stella%20%26%20co</a>'));
  assert.ok(corpo('[iscriviti](https://modulo.it/?s={{societa}})', dati)
    .includes('<a href="https://modulo.it/?s=A.S.D.%20Stella%20%26%20co" style="color:#D4204D">iscriviti</a>'));
  assert.equal(semplice('https://modulo.it/?s={{societa}}', dati), 'https://modulo.it/?s=A.S.D.%20Stella%20%26%20co');
  // scritto a mano con gli spazi
  assert.equal(semplice('https://modulo.it/?s={{ societa }} fine', dati), 'https://modulo.it/?s=A.S.D.%20Stella%20%26%20co fine');
});

test('virgolette in un indirizzo: il link resta testo, nessun attributo aggiunto', () => {
  const html = corpo('[x](https://a.it/"onmouseover="y)');
  // [x](…) non diventa un link; resta solo il link automatico alla parte valida dell'indirizzo
  assert.ok(!html.includes('>x</a>'));
  assert.ok(html.includes('[x](<a href="https://a.it/" style="color:#D4204D">https://a.it/</a>&quot;onmouseover=&quot;y)'));
  assert.ok(!html.includes('onmouseover="'));
});

test('un link attaccato a un indirizzo nudo non si perde', () => {
  const html = corpo('https://a.it[x](https://b.it)');
  assert.ok(!html.includes('\u0000'));
  assert.ok(html.includes('<a href="https://b.it" style="color:#D4204D">x</a>'));
});

test('tre asterischi: grassetto e corsivo annidati correttamente', () => {
  assert.equal(corpo('***forte***'), '<p style="margin:0 0 16px"><strong style="color:#6D586F"><em>forte</em></strong></p>');
  assert.equal(semplice('***forte***'), 'forte');
});

test('la punteggiatura finale resta fuori dal link automatico', () => {
  assert.ok(corpo('scrivi a https://a.it/x.').includes('<a href="https://a.it/x" style="color:#D4204D">https://a.it/x</a>.</p>'));
});

test('i valori dei segnaposto restano testo, escapati', () => {
  const dati = { societa: 'A.S.D. *Stella* __x__ <b>', categoria: 'Promozione' };
  const html = corpo('Gentile **{{societa}}**, {{ignoto}}', dati);
  assert.equal(html, '<p style="margin:0 0 16px">Gentile <strong style="color:#6D586F">A.S.D. *Stella* __x__ &lt;b&gt;</strong>, {{ignoto}}</p>');
  assert.equal(semplice('Gentile {{societa}}', dati), 'Gentile A.S.D. *Stella* __x__ <b>');
});

test('il testo dell\'utente è sempre escapato', () => {
  const html = corpo('<script>alert("x")</script> & \'ok\'');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;ok&#39;'));
  assert.ok(!html.includes('<script'));
});

test('elenchi e titoletti non finiscono mai dentro un paragrafo', () => {
  assert.equal(corpo('Programma:\n- partite\n- talk'),
    '<p style="margin:0 0 16px">Programma:</p><ul style="margin:0 0 16px;padding-left:22px"><li style="margin:0 0 6px">partite</li><li style="margin:0 0 6px">talk</li></ul>');
  const html = corpo('## Date\nsabato 12\ndomenica 13');
  assert.ok(html.startsWith('<p style="margin:8px 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:#D4204D">Date</p>'));
  assert.ok(html.endsWith('<p style="margin:0 0 16px">sabato 12<br>domenica 13</p>'));
  const misto = corpo('a\n- uno\nb\n## T\n- due\n\n- tre');
  assert.ok(!/<p[^>]*>(?:(?!<\/p>).)*<(ul|p)[\s>]/s.test(misto), misto);
  // "uno" | "due" | "tre": il titoletto e la riga vuota chiudono l'elenco
  assert.equal((misto.match(/<ul /g) || []).length, 3);
  assert.equal(semplice('## Date\n- **uno**\ntesto'), 'Date\n- uno\ntesto');
});

test('righe vuote separano i paragrafi, a capo singolo diventa <br>', () => {
  assert.equal(corpo('uno\ndue\n\ntre'), '<p style="margin:0 0 16px">uno<br>due</p><p style="margin:0 0 16px">tre</p>');
});
