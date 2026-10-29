import * as store from './store.js';
import * as foglio from './foglio.js';
import { utente } from './google.js';
import { disegnaAccount, caricaDati } from './accesso.js';
import { $, escape, avviso, numero, dataOra, scarica, csv } from './ui.js';

const STATI = ['', 'Interessata', 'Aderito', 'Non interessata', 'Nessuna risposta'];
let dati = null;

function filtrati() {
  const test = $('#mostra-test').checked;
  const campagna = $('#filtro-campagna').value;
  return dati.invii.filter((r) => (test || !r.test) && (!campagna || r.campagna === campagna));
}

function disegnaCampagne() {
  const select = $('#filtro-campagna');
  const attuale = select.value;
  const campagne = [...new Set(dati.invii.map((r) => r.campagna).filter(Boolean))].sort();
  select.innerHTML = `<option value="">Tutte le campagne</option>${campagne.map((c) => `<option ${c === attuale ? 'selected' : ''}>${escape(c)}</option>`).join('')}`;
}

function barre(contenitore, voci) {
  if (!voci.length) {
    contenitore.innerHTML = '<p class="secondaria">Nessun dato.</p>';
    return;
  }
  contenitore.innerHTML = voci.map(({ nome, fatto, totale }) => {
    const perc = totale && fatto ? Math.max(1.5, (fatto / totale) * 100) : 0;
    return `<div class="voce" title="${escape(nome)}: ${fatto} su ${totale}">
      <span>${escape(nome)}</span>
      <div class="traccia"><div style="width:${perc.toFixed(1)}%"></div></div>
      <span class="valore">${numero(fatto)} / ${numero(totale)}</span></div>`;
  }).join('');
}

function copertura(lista) {
  const contattate = new Set(lista.filter((r) => r.esito === 'inviato').map((r) => r.email));
  const perRegione = new Map();
  const perCategoria = new Map();
  const aggiungi = (mappa, chiave, email) => {
    if (!mappa.has(chiave)) mappa.set(chiave, { tutte: new Set(), fatte: new Set() });
    const v = mappa.get(chiave);
    v.tutte.add(email);
    if (contattate.has(email)) v.fatte.add(email);
  };
  for (const s of dati.squadre) {
    if (!s.email) continue;
    aggiungi(perRegione, s.regione, s.email);
    aggiungi(perCategoria, s.categoria, s.email);
  }
  const voci = (mappa, ordine) => ordine
    .filter((k) => mappa.has(k))
    .map((k) => ({ nome: k, fatto: mappa.get(k).fatte.size, totale: mappa.get(k).tutte.size }));
  const regioni = voci(perRegione, dati.regioni).sort((a, b) => b.fatto / b.totale - a.fatto / a.totale || a.nome.localeCompare(b.nome));
  return { contattate, regioni, categorie: voci(perCategoria, dati.categorie) };
}

function disegnaGiorni(lista) {
  const conteggi = new Map();
  for (const r of lista) {
    if (r.esito !== 'inviato') continue;
    const g = store.giorno(r.data);
    conteggi.set(g, (conteggi.get(g) || 0) + 1);
  }
  const giorni = [...conteggi.keys()].sort().slice(-30);
  if (!giorni.length) {
    $('#per-giorno').innerHTML = '<p class="secondaria">Ancora nessun invio.</p>';
    return;
  }
  const massimo = Math.max(...giorni.map((g) => conteggi.get(g)));
  const etichetta = (g) => new Date(`${g}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  $('#per-giorno').innerHTML = `<div class="colonne">${giorni.map((g) => `<div class="col" title="${etichetta(g)}: ${conteggi.get(g)} invii"><span>${conteggi.get(g)}</span><div style="height:${(conteggi.get(g) / massimo) * 100}%"></div></div>`).join('')}</div>
    <div class="assi">${giorni.map((g) => `<span>${etichetta(g)}</span>`).join('')}</div>`;
}

function disegnaStorico(lista) {
  const testo = $('#cerca').value.trim().toLowerCase();
  const righe = lista
    .filter((r) => !testo || `${r.societa} ${r.email} ${r.destinatario}`.toLowerCase().includes(testo))
    .slice()
    .reverse();
  if (!righe.length) {
    $('#storico').innerHTML = '<tr><td colspan="7" class="vuoto"><strong>Nessun invio</strong>Quando spedisci dalla pagina Invio, le mail compaiono qui.</td></tr>';
    return;
  }
  $('#storico').innerHTML = righe.map((r) => {
    const esito = r.esito === 'inviato'
      ? `<span class="badge ok">Inviata</span>${r.test ? ' <span class="badge test">Test</span>' : ''}`
      : `<span class="badge errore" title="${escape(r.errore)}">Errore</span><div class="secondaria">${escape(r.errore)}</div>`;
    const scelto = dati.stati[r.email] || '';
    return `<tr>
      <td>${dataOra(r.data)}</td>
      <td>${escape(r.societa)}</td>
      <td>${escape(r.regione)}<div class="secondaria">${escape((r.categorie || []).join(', '))}</div></td>
      <td>${escape(r.email)}${r.destinatario !== r.email ? `<div class="secondaria">spedita a ${escape(r.destinatario)}</div>` : ''}${r.cc ? `<div class="secondaria">cc ${escape(r.cc)}</div>` : ''}</td>
      <td>${escape(r.campagna)}<div class="secondaria">da ${escape(r.mittente)}</div></td>
      <td>${esito}</td>
      <td>${r.test ? '' : `<select class="stato" data-email="${escape(r.email)}" aria-label="Stato di ${escape(r.societa)}">${STATI.map((s) => `<option value="${s}" ${s === scelto ? 'selected' : ''}>${s || '—'}</option>`).join('')}</select>`}</td>
    </tr>`;
  }).join('');
}

function disegna() {
  const lista = filtrati();
  const { contattate, regioni, categorie } = copertura(lista);
  const totaleEmail = new Set(dati.squadre.filter((s) => s.email).map((s) => s.email)).size;
  const inviate = lista.filter((r) => r.esito === 'inviato').length;
  const errori = lista.filter((r) => r.esito === 'errore').length;
  const valori = Object.values(dati.stati);
  const aderito = valori.filter((s) => s === 'Aderito').length;
  const interessate = valori.filter((s) => s === 'Interessata').length;

  $('#kpi').innerHTML = `
    <div><strong>${numero(contattate.size)}</strong><span>Società contattate</span><small>su ${numero(totaleEmail)} con email (${totaleEmail ? ((contattate.size / totaleEmail) * 100).toFixed(1) : 0}%)</small></div>
    <div><strong>${numero(inviate)}</strong><span>Mail inviate</span><small>${numero(errori)} non partite per errore</small></div>
    <div><strong>${numero(aderito)}</strong><span>Hanno aderito</span><small>${numero(interessate)} interessate</small></div>
    <div><strong>${numero(store.inviatiOggi(dati.invii))}</strong><span>Inviate oggi</span><small>da tutto il team</small></div>`;

  barre($('#per-regione'), regioni);
  barre($('#per-categoria'), categorie);
  disegnaGiorni(lista);
  disegnaStorico(lista);
}

function esportaCsv() {
  const righe = [['Data', 'Società', 'Regione', 'Categorie', 'Email', 'Spedita a', 'CC', 'Campagna', 'Oggetto', 'Mittente', 'Esito', 'Errore', 'Test', 'Stato società']];
  for (const r of filtrati()) {
    righe.push([dataOra(r.data), r.societa, r.regione, (r.categorie || []).join(', '), r.email, r.destinatario, r.cc, r.campagna, r.oggetto, r.mittente, r.esito, r.errore, r.test ? 'sì' : '', dati.stati[r.email] || '']);
  }
  scarica(`invii-ogni-passaggio-conta-${store.giorno(new Date().toISOString())}.csv`, csv(righe), 'text/csv;charset=utf-8');
}

async function ricarica() {
  disegnaAccount($('#account'), ricarica);
  dati = await caricaDati($('#stato-dati'));
  $('#contenuto').hidden = !dati;
  if (!dati) {
    disegnaAccount($('#account'), ricarica);
    return;
  }
  disegnaCampagne();
  disegna();
}

$('#mostra-test').addEventListener('change', disegna);
$('#filtro-campagna').addEventListener('change', disegna);
$('#cerca').addEventListener('input', () => disegnaStorico(filtrati()));
$('#esporta-csv').addEventListener('click', esportaCsv);
$('#storico').addEventListener('change', async (e) => {
  if (!e.target.matches('.stato')) return;
  const { email } = e.target.dataset;
  const valore = e.target.value;
  e.target.disabled = true;
  try {
    await foglio.impostaStato(email, valore, utente()?.email || '');
    if (valore) dati.stati[email] = valore;
    else delete dati.stati[email];
    avviso('Stato salvato sul foglio', 'ok');
    disegna();
  } catch (err) {
    avviso(`Stato non salvato: ${err.message}`, 'errore');
    e.target.disabled = false;
    e.target.value = dati.stati[email] || '';
  }
});

ricarica();
