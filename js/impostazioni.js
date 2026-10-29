import * as store from './store.js';
import * as foglio from './foglio.js';
import { utente } from './google.js';
import { disegnaAccount, recuperaInSospeso, amministratore } from './accesso.js';
import { $, avviso, numero } from './ui.js';

const CAMPI_TESTO = ['googleClientId', 'idFoglio', 'nomeMittente', 'replyTo', 'emailTest'];
const CAMPI_NUMERO = { maxInviiTest: 1, pausaSecondi: 2, limiteGiornaliero: 1 };

/** Accetta l'ID o l'indirizzo completo del foglio. */
function soloId(valore) {
  const trovato = valore.match(/\/spreadsheets\/d\/([\w-]+)/);
  return trovato ? trovato[1] : valore.trim();
}

function carica() {
  const imp = store.impostazioni();
  for (const c of [...CAMPI_TESTO, ...Object.keys(CAMPI_NUMERO)]) $(`#${c}`).value = imp[c] ?? '';
  $('#origine').textContent = location.origin;
  aggiornaFoglio();
}

function aggiornaFoglio() {
  const imp = store.impostazioni();
  const link = $('#apri-foglio');
  link.hidden = !imp.idFoglio;
  link.href = foglio.urlFoglio(imp.idFoglio);
  const connesso = Boolean(utente());
  $('#crea-foglio').disabled = !connesso;
  $('#carica-squadre').disabled = !connesso || !imp.idFoglio;
  $('#stato-foglio').textContent = connesso ? '' : 'Accedi con Google per creare il foglio o caricare l\'elenco società.';
  const sospesi = store.inSospeso().length;
  $('#sospesi').textContent = sospesi ? `${numero(sospesi)} invii sono salvati solo in questo browser perché la scrittura sul foglio non è riuscita.` : '';
  $('#riprova-sospesi').hidden = !sospesi || !connesso;
}

function salva(valori) {
  if (store.salvaImpostazioni(valori)) return true;
  avviso('Il browser non permette di salvare (navigazione privata?)', 'errore');
  return false;
}

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const valori = {};
  for (const c of CAMPI_TESTO) valori[c] = $(`#${c}`).value.trim();
  valori.idFoglio = soloId(valori.idFoglio);
  for (const [c, minimo] of Object.entries(CAMPI_NUMERO)) {
    const n = Number($(`#${c}`).value);
    if (!Number.isFinite(n) || n < minimo) {
      avviso(`"${$(`label[for=${c}]`).textContent}" deve essere almeno ${minimo}`, 'errore');
      return;
    }
    valori[c] = n;
  }
  if (salva(valori)) {
    avviso('Impostazioni salvate', 'ok');
    carica();
    aggiornaAccesso();
  }
});

$('#crea-foglio').addEventListener('click', async () => {
  const b = $('#crea-foglio');
  b.disabled = true;
  $('#stato-foglio').textContent = 'Creazione del foglio…';
  try {
    const id = await foglio.creaFoglio();
    salva({ ...store.impostazioni(), idFoglio: id });
    carica();
    $('#stato-foglio').innerHTML = `Foglio creato nel tuo Google Drive. Ora carica l'elenco società qui sotto, poi condividi il foglio con il team e metti l'ID <code>${id}</code> in <code>js/config.js</code> perché valga per tutti.`;
  } catch (err) {
    $('#stato-foglio').textContent = err.message;
    b.disabled = false;
  }
});

$('#carica-squadre').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dati = JSON.parse(await file.text());
    if (!Array.isArray(dati.squadre) || !dati.squadre.length) throw new Error('il file non contiene "squadre"');
    avviso(`Caricamento di ${numero(dati.squadre.length)} squadre…`);
    await foglio.sostituisciSquadre(dati.squadre);
    avviso(`${numero(dati.squadre.length)} squadre caricate nel foglio`, 'ok');
  } catch (err) {
    avviso(`Caricamento non riuscito: ${err.message}`, 'errore');
  }
});

$('#riprova-sospesi').addEventListener('click', async () => {
  const restano = await recuperaInSospeso();
  if (restano) avviso('Scrittura sul foglio ancora non riuscita: riprova più tardi.', 'errore');
  aggiornaFoglio();
});

/**
 * Mostra le impostazioni solo agli amministratori. Senza Client ID la pagina
 * resta aperta: serve per la prima configurazione, prima di poter accedere.
 */
function aggiornaAccesso() {
  const libero = !store.impostazioni().googleClientId || amministratore();
  $('#pannello').hidden = !libero;
  $('#riservato').hidden = libero;
  if (libero) {
    disegnaAccount($('#account'), aggiornaAccesso);
    aggiornaFoglio();
    return;
  }
  const u = utente();
  $('#motivo').textContent = u
    ? `L'account ${u.email} non può modificare le impostazioni. Accedi con un account amministratore.`
    : 'Accedi con un account amministratore per modificare le impostazioni.';
  disegnaAccount($('#account-riservato'), aggiornaAccesso);
}

aggiornaAccesso();
carica();
