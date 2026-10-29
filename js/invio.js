import * as store from './store.js';
import * as foglio from './foglio.js';
import { utente, inviaEmail } from './google.js';
import { destinatari, leggiIndirizziManuali, segnapostoBloccanti, gruppiManuali } from './destinatari.js';
import { disegnaAccount, caricaDati } from './accesso.js';
import { MODELLO_PREDEFINITO, SEGNAPOSTO, sostituisci, segnapostoSconosciuti, htmlEmail, testoSemplice, caricaLogo, SRC_LOGO_MAIL, SRC_LOGO_ANTEPRIMA } from './modello-email.js';
import { valutaAllegati, byteInBase64, formatoDimensione, LIMITE_ALLEGATI } from './allegati.js';
import { $, $$, escape, avviso, numero, pausa } from './ui.js';

const imp = store.impostazioni();
const stato = {
  dati: null,
  regioni: new Set(),
  categorie: new Set(),
  cerca: '',
  // email -> true/false scelto a mano; senza scelta vale "selezionata se mai contattata"
  scelte: new Map(),
  // allegati di questo invio, solo in memoria: {nome, tipo, dimensione, base64}
  allegati: [],
  gruppi: [],
  conferma: false,
  inCorso: false,
  stop: false,
};
let ultimoCampo = null;

// --- Dati -------------------------------------------------------------------

async function ricarica() {
  disegnaAccount($('#account'), ricarica);
  stato.dati = await caricaDati($('#stato-dati'));
  if (!stato.dati) {
    disegnaAccount($('#account'), ricarica);
    $('#regioni').innerHTML = '';
    $('#categorie').innerHTML = '';
    $('#righe').innerHTML = '';
    $('#riepilogo').innerHTML = '';
    stato.gruppi = [];
    aggiornaSelezione();
    return;
  }
  if (!stato.categorie.size) stato.dati.categorie.forEach((c) => stato.categorie.add(c));
  disegnaFiltri();
  disegnaTabella();
}

// --- Destinatari ------------------------------------------------------------

function chip(contenitore, valori, insieme, conteggi) {
  contenitore.innerHTML = valori
    .map((v) => `<button class="chip" data-valore="${escape(v)}" aria-pressed="${insieme.has(v)}">${escape(v)} <small>${numero(conteggi[v] || 0)}</small></button>`)
    .join('');
}

function disegnaFiltri() {
  const { regioni, categorie, squadre } = stato.dati;
  const perRegione = {};
  const perCategoria = {};
  for (const s of squadre) {
    if (!s.email) continue;
    perRegione[s.regione] = (perRegione[s.regione] || 0) + 1;
    if (stato.regioni.size === 0 || stato.regioni.has(s.regione)) perCategoria[s.categoria] = (perCategoria[s.categoria] || 0) + 1;
  }
  chip($('#regioni'), regioni, stato.regioni, perRegione);
  chip($('#categorie'), categorie, stato.categorie, perCategoria);
}

function calcolaGruppi() {
  const contattate = store.emailContattate(stato.dati.invii);
  const statiContatti = stato.dati.stati;
  const testo = stato.cerca.trim().toLowerCase();
  const nascondi = $('#nascondi-contattate').checked;
  const mappa = new Map();
  let senzaEmail = 0;
  let squadreTrovate = 0;

  for (const s of stato.dati.squadre) {
    if (!stato.regioni.has(s.regione) || !stato.categorie.has(s.categoria)) continue;
    if (testo && !`${s.societa} ${s.email} ${s.email2} ${s.provincia} ${s.sede}`.toLowerCase().includes(testo)) continue;
    squadreTrovate++;
    if (!s.email) { senzaEmail++; continue; }
    let g = mappa.get(s.email);
    if (!g) {
      g = { email: s.email, email2: '', squadre: [], contattata: contattate.get(s.email), stato: statiContatti[s.email] };
      mappa.set(s.email, g);
    }
    g.squadre.push(s);
    if (!g.email2 && s.email2) g.email2 = s.email2;
  }

  const tutti = [...mappa.values()];
  const escluse = nascondi ? tutti.filter((g) => g.contattata).length : 0;
  const societa = nascondi ? tutti.filter((g) => !g.contattata) : tutti;

  // Indirizzi scritti a mano: valgono a prescindere da filtri e ricerca.
  const manuali = leggiIndirizziManuali($('#manuali').value);
  const emailDelFoglio = new Set(stato.dati.squadre.map((s) => s.email.toLowerCase()).filter(Boolean));
  const { gruppi: aMano, giaSocieta, esclusi } = gruppiManuali(manuali.validi, { emailDelFoglio, contattate, stati: statiContatti, nascondi });
  stato.manuali = { validi: manuali.validi.length, nonValidi: manuali.nonValidi, giaSocieta, esclusi };
  stato.gruppi = [...aMano, ...societa];
  return { squadreTrovate, senzaEmail, escluse, aMano: aMano.length };
}

const selezionato = (g) => stato.scelte.has(g.email) ? stato.scelte.get(g.email) : !g.contattata;
const selezionati = () => stato.gruppi.filter(selezionato);
const unici = (valori) => [...new Set(valori)];

// Destinatario finto per provare il messaggio senza selezionare società:
// si usa solo in modalità test, che spedisce comunque all'indirizzo di test.
const ESEMPIO = {
  email: '',
  email2: '',
  squadre: [{ id: 'esempio', societa: 'Società di esempio', categoria: 'Promozione', regione: 'Veneto', provincia: 'VR', girone: 'A' }],
};

function disegnaTabella() {
  if (!stato.dati) return;
  const { squadreTrovate, senzaEmail, escluse, aMano } = calcolaGruppi();
  const corpo = $('#righe');
  const filtri = stato.regioni.size > 0 && stato.categorie.size > 0;

  if (!filtri && !aMano) {
    $('#riepilogo').innerHTML = '';
    corpo.innerHTML = '<tr><td colspan="6" class="vuoto"><strong>Scegli regione e categoria</strong>Seleziona almeno una regione e una categoria per vedere le società.</td></tr>';
  } else if (stato.gruppi.length === 0) {
    corpo.innerHTML = '<tr><td colspan="6" class="vuoto"><strong>Nessuna società da contattare</strong>Con questi filtri non resta nessuno: prova a cambiarli.</td></tr>';
  } else {
    corpo.innerHTML = stato.gruppi.map((g) => {
      const nomi = unici(g.squadre.map((s) => s.societa));
      const categorie = unici(g.squadre.map((s) => s.categoria));
      let badge = '<span class="badge neutro">Da contattare</span>';
      if (g.contattata) badge = `<span class="badge ok">Contattata ${new Date(g.contattata.data).toLocaleDateString('it-IT')}</span>`;
      if (g.stato) badge += ` <span class="badge test">${escape(g.stato)}</span>`;
      return `<tr class="${g.contattata ? 'contattata' : ''}">
        <td><input type="checkbox" class="sel" data-email="${escape(g.email)}" ${selezionato(g) ? 'checked' : ''} aria-label="Invia a ${escape(nomi[0])}"></td>
        <td>${nomi.map(escape).join('<br>')}<div class="secondaria">${g.manuale ? 'scritto a mano' : escape(g.squadre[0].regione)}</div></td>
        <td>${g.manuale ? '<span class="badge neutro">a mano</span>' : categorie.map(escape).join('<br>')}</td>
        <td>${escape(unici(g.squadre.map((s) => s.provincia)).join(', '))}</td>
        <td>${escape(g.email)}${g.email2 ? `<div class="secondaria">CC: ${escape(g.email2)}</div>` : ''}</td>
        <td>${badge}</td></tr>`;
    }).join('');
  }

  if (filtri || aMano) {
    $('#riepilogo').innerHTML = `<span><strong>${numero(stato.gruppi.length)}</strong> email uniche</span>
      ${filtri ? `<span><strong>${numero(squadreTrovate)}</strong> squadre trovate</span>` : ''}
      ${aMano ? `<span><strong>${numero(aMano)}</strong> scritti a mano</span>` : ''}
      ${escluse ? `<span><strong>${numero(escluse)}</strong> già contattate (escluse)</span>` : ''}
      ${senzaEmail ? `<span><strong>${numero(senzaEmail)}</strong> squadre senza email</span>` : ''}`;
  }
  disegnaManuali();
  aggiornaSelezione();
}

/** Riepilogo sotto il campo degli indirizzi scritti a mano. */
function disegnaManuali() {
  const m = stato.dati ? stato.manuali : null;
  const letti = m || (() => { const l = leggiIndirizziManuali($('#manuali').value); return { validi: l.validi.length, nonValidi: l.nonValidi, giaSocieta: [], esclusi: 0 }; })();
  const parti = [];
  if (letti.validi) parti.push(`${numero(letti.validi)} ${letti.validi === 1 ? 'indirizzo valido' : 'indirizzi validi'}`);
  if (letti.esclusi) parti.push(`${numero(letti.esclusi)} già contattati (esclusi)`);
  if (letti.nonValidi.length) parti.push(`<span style="color:var(--errore)">righe non valide: ${letti.nonValidi.map((r) => `"${escape(r)}"`).join(', ')}</span>`);
  if (letti.giaSocieta.length) parti.push(`già nell'elenco società, selezionale da lì: ${letti.giaSocieta.map(escape).join(', ')}`);
  $('#riepilogo-manuali').innerHTML = parti.join(' · ');
}

function aggiornaSelezione() {
  const n = selezionati().length;
  $('#conta-selezionati').textContent = `${numero(n)} selezionate su ${numero(stato.gruppi.length)}`;
  stato.conferma = false;
  disegnaAnteprima();
  disegnaInvio();
}

// --- Messaggio --------------------------------------------------------------

function datiSegnaposto(g) {
  const s = g.squadre[0];
  // per gli indirizzi scritti a mano c'è solo il nome (vedi segnapostoSenzaValore)
  if (g.manuale) return { societa: s.societa };
  return {
    societa: s.societa,
    // le squadre sono ordinate per categoria: la prima è la più alta
    categoria: s.categoria,
    regione: s.regione,
    provincia: s.provincia,
    girone: unici(g.squadre.map((x) => x.girone)).join(', '),
  };
}

function messaggio() {
  return { campagna: $('#campagna').value.trim(), oggetto: $('#oggetto').value, corpo: $('#corpo').value, manuali: $('#manuali').value };
}

function caricaBozza() {
  const b = store.bozza() || MODELLO_PREDEFINITO;
  $('#campagna').value = b.campagna ?? MODELLO_PREDEFINITO.campagna;
  $('#oggetto').value = b.oggetto ?? MODELLO_PREDEFINITO.oggetto;
  $('#corpo').value = b.corpo ?? MODELLO_PREDEFINITO.corpo;
  $('#manuali').value = b.manuali ?? '';
}

function disegnaAnteprima() {
  const primo = selezionati()[0] || ($('#modalita-test').checked ? ESEMPIO : null);
  const frame = $('#anteprima');
  const etichettaOggetto = $('#anteprima-oggetto');
  if (!primo) {
    $('#anteprima-per').textContent = 'Seleziona almeno un destinatario per vedere l\'anteprima.';
    etichettaOggetto.hidden = true;
    frame.srcdoc = htmlEmail(messaggio().corpo, { logo: SRC_LOGO_ANTEPRIMA });
    disegnaAllegatiAnteprima();
    return;
  }
  const dati = datiSegnaposto(primo);
  const m = messaggio();
  $('#anteprima-per').textContent = primo === ESEMPIO
    ? `Anteprima con una società di esempio: in modalità test arriva solo ${destinoTest()}.`
    : `Come la riceverà ${dati.societa} (${primo.email}).`;
  etichettaOggetto.hidden = false;
  etichettaOggetto.innerHTML = `<strong>Oggetto:</strong> ${escape(sostituisci(m.oggetto, dati))}`;
  frame.srcdoc = htmlEmail(m.corpo, { logo: SRC_LOGO_ANTEPRIMA, dati });
  disegnaAllegatiAnteprima();
}

function inserisciSegnaposto(chiave) {
  const campo = ultimoCampo || $('#corpo');
  const testo = `{{${chiave}}}`;
  const { selectionStart: da, selectionEnd: a, value } = campo;
  campo.value = value.slice(0, da) + testo + value.slice(a);
  campo.focus();
  campo.selectionStart = campo.selectionEnd = da + testo.length;
  campo.dispatchEvent(new Event('input'));
}

// --- Barra di formattazione -------------------------------------------------

/**
 * Sostituisce il tratto da..a del campo con `testo`. Con execCommand il
 * browser conserva l'annulla (Ctrl+Z) ed emette da solo l'evento input.
 */
function scriviNelCampo(campo, da, a, testo) {
  campo.focus();
  campo.setSelectionRange(da, a);
  if (!document.execCommand?.('insertText', false, testo)) {
    campo.setRangeText(testo, da, a, 'end');
    campo.dispatchEvent(new Event('input'));
  }
}

/** Racchiude la selezione tra due marcatori; senza selezione inserisce "testo", già selezionato. */
function racchiudi(prima, dopo = prima) {
  const campo = $('#corpo');
  const { selectionStart: da, selectionEnd: a, value } = campo;
  const scelto = value.slice(da, a) || 'testo';
  scriviNelCampo(campo, da, a, prima + scelto + dopo);
  campo.setSelectionRange(da + prima.length, da + prima.length + scelto.length);
}

/** [selezione](https://) con "https://" selezionato, da sostituire con l'indirizzo. */
function inserisciLink() {
  const campo = $('#corpo');
  const { selectionStart: da, selectionEnd: a, value } = campo;
  const scelto = value.slice(da, a) || 'testo del link';
  scriviNelCampo(campo, da, a, `[${scelto}](https://)`);
  const inizio = da + scelto.length + 3;
  campo.setSelectionRange(inizio, inizio + 'https://'.length);
}

/** Aggiunge `prefisso` a ogni riga toccata dalla selezione, o lo toglie se tutte lo hanno già. */
function aInizioRiga(prefisso) {
  const campo = $('#corpo');
  const { selectionStart: da, selectionEnd: a, value } = campo;
  const inizio = da === 0 ? 0 : value.lastIndexOf('\n', da - 1) + 1;
  const fineRiga = value.indexOf('\n', a);
  const fine = fineRiga === -1 ? value.length : fineRiga;
  const righe = value.slice(inizio, fine).split('\n');
  const togli = righe.every((r) => r.startsWith(prefisso));
  const nuovo = righe.map((r) => {
    if (togli) return r.slice(prefisso.length);
    return r.startsWith(prefisso) ? r : prefisso + r;
  }).join('\n');
  scriviNelCampo(campo, inizio, fine, nuovo);
  campo.setSelectionRange(inizio, inizio + nuovo.length);
}

const FORMATI = {
  grassetto: () => racchiudi('**'),
  corsivo: () => racchiudi('*'),
  sottolineato: () => racchiudi('__'),
  elenco: () => aInizioRiga('- '),
  titoletto: () => aInizioRiga('## '),
  link: inserisciLink,
};
const SCORCIATOIE = { b: 'grassetto', i: 'corsivo', u: 'sottolineato' };

// --- Allegati ---------------------------------------------------------------

function riepilogoAllegati() {
  const totale = stato.allegati.reduce((somma, f) => somma + f.dimensione, 0);
  return `${stato.allegati.length} ${stato.allegati.length === 1 ? 'allegato' : 'allegati'} (${formatoDimensione(totale)})`;
}

function disegnaAllegati() {
  $('#elenco-allegati').innerHTML = stato.allegati.map((f, i) => `<li><span>${escape(f.nome)}</span><small>${formatoDimensione(f.dimensione)}</small>
    <button type="button" class="btn link" data-rimuovi="${i}" aria-label="Rimuovi ${escape(f.nome)}">Rimuovi</button></li>`).join('');
  $('#totale-allegati').textContent = stato.allegati.length ? `${riepilogoAllegati()} su ${formatoDimensione(LIMITE_ALLEGATI)}` : '';
}

function disegnaAllegatiAnteprima() {
  const box = $('#anteprima-allegati');
  box.hidden = !stato.allegati.length;
  box.innerHTML = `<strong>Allegati:</strong> ${stato.allegati.map((f) => `${escape(f.nome)} (${formatoDimensione(f.dimensione)})`).join(', ')}`;
}

/** Dopo ogni cambio degli allegati la conferma dell'invio reale va ridata. */
function allegatiCambiati() {
  stato.conferma = false;
  disegnaAllegati();
  disegnaAnteprima();
  disegnaInvio();
}

async function aggiungiAllegati(file) {
  const scegli = $('#allega');
  scegli.disabled = true;
  const { accettati, scartati } = valutaAllegati(stato.allegati, [...file].map((f) => ({ nome: f.name, dimensione: f.size, file: f })));
  for (const f of accettati) {
    try {
      const base64 = byteInBase64(new Uint8Array(await f.file.arrayBuffer()));
      stato.allegati.push({ nome: f.nome, tipo: f.file.type, dimensione: f.dimensione, base64 });
    } catch {
      scartati.push({ nome: f.nome, motivo: 'non si riesce a leggere il file' });
    }
  }
  $('#allegati-scartati').innerHTML = scartati.map((s) => `<li>${escape(s.nome)}: ${escape(s.motivo)}</li>`).join('');
  scegli.disabled = stato.inCorso;
  allegatiCambiati();
}

// --- Invio ------------------------------------------------------------------

/** Destinatario delle mail di prova: quello delle impostazioni o l'account collegato. */
function indirizzoTest() {
  return imp.emailTest || utente()?.email || '';
}

/** Dove arrivano le mail di prova, detto senza mostrare l'indirizzo sulla pagina. */
function destinoTest() {
  return imp.emailTest ? 'all\'indirizzo di test impostato' : 'all\'account Google con cui hai fatto l\'accesso';
}

function disegnaInvio() {
  const box = $('#controlli-invio');
  const test = $('#modalita-test').checked;
  const selezione = selezionati();
  const esempio = test && !selezione.length;
  const lista = esempio ? [ESEMPIO] : selezione;
  const u = utente();
  const rimasti = Math.max(0, imp.limiteGiornaliero - store.inviatiOggi(stato.dati?.invii || [], u?.email));
  const m = messaggio();
  const sconosciuti = segnapostoSconosciuti(m.oggetto + m.corpo);

  $('#descr-test').innerHTML = test
    ? `Le mail di test vanno solo <strong>${destinoTest()}</strong>, mai alle società, con oggetto preceduto da [TEST], al massimo ${imp.maxInviiTest} per volta. Senza società selezionate si prova con una società di esempio. Non contano come contatti nella dashboard.`
    : '<strong style="color:var(--cremisi)">Disattivata: le mail partono davvero verso le società selezionate.</strong>';

  if (stato.inCorso) { box.innerHTML = ''; return; }

  const blocchi = [];
  const senzaValore = segnapostoBloccanti(lista, m.oggetto + m.corpo);
  if (senzaValore.length) {
    blocchi.push(`<p class="nota errore">Il testo usa ${senzaValore.map((c) => `<code>{{${escape(c)}}}</code>`).join(', ')}, che per gli indirizzi scritti a mano non ha valore: toglilo dal testo o deseleziona quegli indirizzi.</p>`);
  }
  if (sconosciuti.length) blocchi.push(`<p class="nota errore">Segnaposto non riconosciuti: ${sconosciuti.map((c) => `<code>{{${escape(c)}}}</code>`).join(', ')}. Correggili prima di inviare.</p>`);
  if (!m.oggetto.trim() || !m.corpo.trim()) blocchi.push('<p class="nota errore">Oggetto e testo non possono essere vuoti.</p>');
  if (!u) blocchi.push('<p class="nota">Accedi con Google al passo 1 per poter inviare.</p>');
  if (!lista.length) blocchi.push('<p class="nota">Nessun destinatario selezionato.</p>');
  const bloccato = blocchi.some((b) => b.includes('errore')) || !u || !lista.length;

  const quante = test ? Math.min(lista.length, imp.maxInviiTest) : Math.min(lista.length, rimasti);
  const aMano = lista.slice(0, quante).filter((g) => g.manuale).length;
  let html = blocchi.join('');
  if (u) html += `<p class="secondaria">Oggi ${escape(u.email)} ha già inviato ${numero(imp.limiteGiornaliero - rimasti)} mail su un limite di ${numero(imp.limiteGiornaliero)}.</p>`;
  if (!test && lista.length > rimasti) {
    html += `<p class="nota attenzione">Oggi puoi inviarne ancora ${numero(rimasti)}: partiranno le prime ${numero(rimasti)}, le altre restano da contattare per domani.</p>`;
  }

  if (!test && stato.conferma) {
    html += `<p class="nota attenzione">Stai per inviare <strong>${numero(quante)} mail reali</strong>${aMano ? ` (di cui <strong>${numero(aMano)} a indirizzi scritti a mano</strong>)` : ''} da <strong>${escape(u.email)}</strong> per la campagna "${escape(m.campagna || 'senza nome')}"${stato.allegati.length ? `, con ${riepilogoAllegati()}` : ', senza allegati'}. Una volta partite non si possono ritirare.</p>
      <div class="riga"><button class="btn grande" id="conferma">Sì, invia ${numero(quante)} mail</button><button class="btn secondario" id="annulla">Annulla</button></div>`;
  } else {
    const etichetta = esempio
      ? 'Invia 1 mail di prova (società di esempio)'
      : test ? `Invia ${quante} mail di prova` : `Invia a ${numero(quante)} ${aMano ? 'destinatari' : 'società'}`;
    html += `<button class="btn grande" id="invia" ${bloccato || quante === 0 ? 'disabled' : ''}>${escape(etichetta)}</button>`;
  }
  box.innerHTML = html;

  const invia = $('#invia');
  if (invia) invia.onclick = () => {
    if (test) avviaInvio(lista.slice(0, quante), true);
    else { stato.conferma = true; disegnaInvio(); }
  };
  const conferma = $('#conferma');
  if (conferma) {
    conferma.onclick = () => avviaInvio(lista.slice(0, quante), false);
    $('#annulla').onclick = () => { stato.conferma = false; disegnaInvio(); };
  }
}

function riga(testo, tipo) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="badge ${tipo}">${tipo === 'ok' ? 'Inviata' : tipo === 'errore' ? 'Errore' : 'Info'}</span><span>${testo}</span>`;
  $('#registro').prepend(li);
}

/** Salva un invio sul foglio; se non ci riesce lo tiene in locale per riprovare dopo. */
async function registra(record) {
  stato.dati.invii.push(record);
  try {
    await foglio.registraInvii([record]);
    return true;
  } catch {
    store.salvaInSospeso([...store.inSospeso(), record]);
    return false;
  }
}

async function avviaInvio(lista, test) {
  // La sessione può essere scaduta mentre la pagina restava aperta.
  if (!utente()) {
    avviso('Sessione Google scaduta: accedi di nuovo.', 'errore');
    disegnaAccount($('#account'), ricarica);
    disegnaInvio();
    return;
  }
  stato.inCorso = true;
  stato.stop = false;
  stato.conferma = false;
  $$('input, textarea, button').forEach((el) => { if (el.id !== 'interrompi') el.disabled = true; });
  $('#interrompi').hidden = false;
  disegnaInvio();
  $('#avanzamento').hidden = false;
  try {
    await invia(lista, test);
  } catch (e) {
    // errore imprevisto: la pagina non deve restare bloccata
    riga(`Invio interrotto: ${escape(e.message)}`, 'errore');
    avviso(`Invio interrotto: ${e.message}`, 'errore');
  } finally {
    stato.inCorso = false;
    $$('input, textarea, button').forEach((el) => { el.disabled = false; });
    $('#interrompi').hidden = true;
    disegnaAccount($('#account'), ricarica);
    disegnaFiltri();
    disegnaTabella();
  }
}

/** Spedisce le mail di `lista` una alla volta, scrivendo ogni invio sul foglio. */
async function invia(lista, test) {
  $('#testo-avanzamento').textContent = 'Controllo sul foglio chi è già stato contattato…';
  // Letti prima di toccare il foglio: un 401 durante la rilettura azzera la sessione.
  const mittente = utente().email;
  const emailTest = indirizzoTest();
  // fissati all'avvio: una scelta fatta durante l'invio non cambia le mail già in corso
  const allegati = [...stato.allegati];

  // Qualcun altro potrebbe aver spedito nel frattempo: si rilegge lo storico.
  if (!test && $('#nascondi-contattate').checked) {
    try {
      const giaFatte = store.emailContattate([...(await foglio.leggiInvii()), ...store.inSospeso()]);
      const prima = lista.length;
      lista = lista.filter((g) => !giaFatte.has(g.email));
      if (lista.length < prima) riga(`${prima - lista.length} società sono state contattate da qualcun altro nel frattempo: saltate.`, 'info');
    } catch (e) {
      riga(e.tipo === 'sessione'
        ? 'Sessione Google scaduta: invio annullato. Accedi di nuovo e riprova.'
        : `Impossibile rileggere lo storico dal foglio (${escape(e.message)}): invio annullato.`, 'errore');
      lista = [];
    }
  }

  const m = messaggio();
  const logo = await caricaLogo();
  if (!logo) riga('Logo non caricato: le mail partono con la testata solo testo.', 'info');
  let riuscite = 0;
  let errori = 0;
  let erroriDiFila = 0;
  let motivoStop = '';
  let nonSalvati = 0;

  for (let i = 0; i < lista.length; i++) {
    if (stato.stop) { motivoStop = 'Invio interrotto da te.'; break; }
    const g = lista[i];
    const dati = datiSegnaposto(g);
    const oggetto = sostituisci(m.oggetto, dati);
    const d = destinatari(g, { test, emailTest, ccSecondaria: $('#cc-secondaria').checked });
    // Doppio controllo: in test non deve mai partire nulla verso una società.
    if (!d || (test && (d.a !== emailTest || d.cc))) {
      motivoStop = 'Modalità test: destinatario diverso dall\'indirizzo di test, invio bloccato.';
      break;
    }
    const { a, cc } = d;
    $('#testo-avanzamento').textContent = `${i + 1} di ${lista.length}: ${dati.societa}`;

    const record = {
      data: new Date().toISOString(),
      email: g.email,
      destinatario: a,
      cc,
      societa: dati.societa,
      regione: dati.regione || '',
      categorie: unici(g.squadre.map((s) => s.categoria)),
      squadre: g.squadre.map((s) => s.id),
      campagna: m.campagna,
      oggetto,
      test,
      mittente,
    };

    try {
      const risposta = await inviaEmail({
        nomeDa: imp.nomeMittente,
        a,
        cc,
        replyTo: imp.replyTo,
        oggetto: test ? `[TEST] ${oggetto}` : oggetto,
        html: htmlEmail(m.corpo, { logo: logo ? SRC_LOGO_MAIL : '', dati }),
        immagini: logo ? [logo] : [],
        allegati,
        testo: testoSemplice(m.corpo, dati),
      });
      record.esito = 'inviato';
      record.idMessaggio = risposta.id;
      riuscite++;
      erroriDiFila = 0;
      riga(`${escape(dati.societa)} → ${escape(a)}${cc ? ` (cc ${escape(cc)})` : ''}`, 'ok');
    } catch (e) {
      record.esito = 'errore';
      record.errore = e.message;
      errori++;
      erroriDiFila++;
      riga(`${escape(dati.societa)} → ${escape(a)}: ${escape(e.message)}`, 'errore');
      if (e.tipo === 'sessione' || e.tipo === 'limite') motivoStop = e.message;
      else if (erroriDiFila >= 3) motivoStop = 'Tre errori di fila: invio fermato per sicurezza.';
    }
    if (!(await registra(record))) nonSalvati++;
    $('#barra').style.width = `${((i + 1) / lista.length) * 100}%`;
    if (motivoStop) break;
    if (i < lista.length - 1) await pausa(imp.pausaSecondi * 1000);
  }

  const esito = `Completato: ${riuscite} inviate, ${errori} errori.${motivoStop ? ` ${motivoStop}` : ''}${nonSalvati ? ` ${nonSalvati} invii non salvati sul foglio: restano in questo browser e verranno salvati al prossimo caricamento.` : ''}`;
  $('#testo-avanzamento').textContent = esito;
  riga(escape(esito), motivoStop ? 'errore' : 'info');
  avviso(esito, errori || motivoStop ? 'errore' : 'ok');
}

// --- Avvio ------------------------------------------------------------------

function collegaEventi() {
  for (const [id, insieme] of [['regioni', stato.regioni], ['categorie', stato.categorie]]) {
    $(`#${id}`).addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const v = b.dataset.valore;
      if (insieme.has(v)) insieme.delete(v);
      else insieme.add(v);
      disegnaFiltri();
      disegnaTabella();
    });
  }
  $$('[data-tutte]').forEach((b) => b.addEventListener('click', () => {
    if (!stato.dati) return;
    const chiave = b.dataset.tutte;
    stato.dati[chiave].forEach((v) => stato[chiave].add(v));
    disegnaFiltri();
    disegnaTabella();
  }));
  $$('[data-nessuna]').forEach((b) => b.addEventListener('click', () => {
    stato[b.dataset.nessuna].clear();
    disegnaFiltri();
    disegnaTabella();
  }));

  let timer;
  let timerManuali;
  $('#manuali').addEventListener('input', () => {
    store.salvaBozza(messaggio());
    clearTimeout(timerManuali);
    timerManuali = setTimeout(() => { if (stato.dati) disegnaTabella(); else disegnaManuali(); }, 300);
  });
  $('#cerca').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { stato.cerca = e.target.value; disegnaTabella(); }, 200);
  });
  $('#nascondi-contattate').addEventListener('change', disegnaTabella);
  $('#cc-secondaria').addEventListener('change', () => disegnaInvio());
  $('#modalita-test').addEventListener('change', () => { stato.conferma = false; disegnaInvio(); disegnaAnteprima(); });

  $('#righe').addEventListener('change', (e) => {
    if (!e.target.matches('.sel')) return;
    stato.scelte.set(e.target.dataset.email, e.target.checked);
    aggiornaSelezione();
  });
  $('#sel-tutti').addEventListener('click', () => { stato.gruppi.forEach((g) => stato.scelte.set(g.email, true)); disegnaTabella(); });
  $('#sel-nessuno').addEventListener('click', () => { stato.gruppi.forEach((g) => stato.scelte.set(g.email, false)); disegnaTabella(); });

  for (const id of ['campagna', 'oggetto', 'corpo']) {
    const campo = $(`#${id}`);
    campo.addEventListener('focus', () => { if (id !== 'campagna') ultimoCampo = campo; });
    campo.addEventListener('input', () => {
      store.salvaBozza(messaggio());
      stato.conferma = false;
      disegnaAnteprima();
      disegnaInvio();
    });
  }
  $('#segnaposto').innerHTML = SEGNAPOSTO.map((s) => `<button class="chip segnaposto" data-chiave="${s.chiave}" title="${escape(s.descrizione)}">{{${s.chiave}}}</button>`).join('');
  $('#segnaposto').addEventListener('click', (e) => {
    const b = e.target.closest('[data-chiave]');
    if (b) inserisciSegnaposto(b.dataset.chiave);
  });
  $('#barra-formato').addEventListener('click', (e) => {
    const b = e.target.closest('[data-formato]');
    if (b) FORMATI[b.dataset.formato]();
  });
  $('#corpo').addEventListener('keydown', (e) => {
    const formato = SCORCIATOIE[e.key.toLowerCase()];
    if (!formato || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    e.preventDefault();
    FORMATI[formato]();
  });
  $('#allega').addEventListener('click', () => $('#scegli-allegati').click());
  $('#scegli-allegati').addEventListener('change', async (e) => {
    await aggiungiAllegati(e.target.files);
    e.target.value = ''; // così si può riscegliere lo stesso file dopo averlo rimosso
  });
  $('#elenco-allegati').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rimuovi]');
    if (!b) return;
    stato.allegati.splice(Number(b.dataset.rimuovi), 1);
    $('#allegati-scartati').innerHTML = '';
    allegatiCambiati();
  });
  $('#ripristina').addEventListener('click', () => {
    $('#campagna').value = MODELLO_PREDEFINITO.campagna;
    $('#oggetto').value = MODELLO_PREDEFINITO.oggetto;
    $('#corpo').value = MODELLO_PREDEFINITO.corpo;
    $('#corpo').dispatchEvent(new Event('input'));
  });
  $('#interrompi').addEventListener('click', () => { stato.stop = true; $('#interrompi').disabled = true; });
  window.addEventListener('beforeunload', (e) => { if (stato.inCorso) e.preventDefault(); });
}

function avvia() {
  caricaBozza();
  disegnaManuali();
  collegaEventi();
  ricarica();
}

avvia();
