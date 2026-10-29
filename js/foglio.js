// Dati su Google Sheet: elenco società (scheda "Squadre"), storico invii
// ("Invii") e stato delle società ("Stati"). L'accesso è regolato dalla
// condivisione del foglio: chi non ce l'ha non vede nulla.
import { chiamaGoogle } from './google.js';
import { impostazioni } from './store.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const ORDINE_CATEGORIE = ['Eccellenza', 'Promozione', 'Prima Categoria', 'Seconda Categoria', 'Terza Categoria'];

export const INTESTAZIONI = {
  Squadre: ['Regione', 'Categoria', 'Girone', 'Società', 'Provincia', 'Sede', 'Telefono', 'Email', 'Email secondaria', 'Sito', 'Scheda tuttocampo'],
  Invii: ['Data', 'Email', 'Spedita a', 'CC', 'Società', 'Regione', 'Categorie', 'Squadre', 'Campagna', 'Oggetto', 'Test', 'Mittente', 'Esito', 'Errore', 'Id messaggio'],
  Stati: ['Email', 'Stato', 'Aggiornato', 'Da'],
};

// Campo del record <-> colonna del foglio
const CAMPI_SQUADRA = { regione: 'Regione', categoria: 'Categoria', girone: 'Girone', societa: 'Società', provincia: 'Provincia', sede: 'Sede', telefono: 'Telefono', email: 'Email', email2: 'Email secondaria', sito: 'Sito', scheda: 'Scheda tuttocampo' };
const CAMPI_INVIO = { data: 'Data', email: 'Email', destinatario: 'Spedita a', cc: 'CC', societa: 'Società', regione: 'Regione', categorie: 'Categorie', squadre: 'Squadre', campagna: 'Campagna', oggetto: 'Oggetto', test: 'Test', mittente: 'Mittente', esito: 'Esito', errore: 'Errore', idMessaggio: 'Id messaggio' };

function idFoglio() {
  const id = impostazioni().idFoglio;
  if (!id) throw new Error('Manca l\'ID del foglio Google: impostalo nella pagina Impostazioni.');
  return id;
}

export function urlFoglio(id = impostazioni().idFoglio) {
  return id ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit` : '';
}

const intervallo = (r) => encodeURIComponent(r);

/** Righe del foglio -> oggetti, cercando le colonne per nome di intestazione. */
function inOggetti(righe, campi) {
  if (!righe?.length) return [];
  const indice = Object.fromEntries(righe[0].map((nome, i) => [String(nome).trim(), i]));
  return righe.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(Object.entries(campi).map(([campo, colonna]) => [campo, indice[colonna] === undefined ? '' : String(r[indice[colonna]] ?? '').trim()])));
}

async function sha1(testo) {
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(testo));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stesso id di scripts/converti_csv.py, così chi aggiunge righe a mano nel foglio non deve calcolarlo. */
async function idSquadra(s) {
  return (await sha1([s.regione, s.categoria, s.girone, s.societa].join('|').toLowerCase())).slice(0, 10);
}

function daInvio(r) {
  return {
    ...r,
    categorie: r.categorie ? r.categorie.split(', ') : [],
    squadre: r.squadre ? r.squadre.split(',') : [],
    test: r.test === 'sì',
  };
}

function versoInvio(r) {
  const v = { ...r, categorie: (r.categorie || []).join(', '), squadre: (r.squadre || []).join(','), test: r.test ? 'sì' : '' };
  return INTESTAZIONI.Invii.map((colonna) => {
    const campo = Object.keys(CAMPI_INVIO).find((k) => CAMPI_INVIO[k] === colonna);
    return v[campo] ?? '';
  });
}

/** Legge in una sola chiamata società, invii e stati. */
export async function leggiTutto() {
  const id = idFoglio();
  const ranges = ['Squadre!A:Z', 'Invii!A:Z', 'Stati!A:Z'].map((r) => `ranges=${intervallo(r)}`).join('&');
  const r = await chiamaGoogle(`${API}/${encodeURIComponent(id)}/values:batchGet?${ranges}`);
  const [squadreRighe, inviiRighe, statiRighe] = r.valueRanges.map((v) => v.values || []);

  const squadre = inOggetti(squadreRighe, CAMPI_SQUADRA);
  for (const s of squadre) {
    s.email = s.email.toLowerCase();
    s.email2 = s.email2.toLowerCase();
    if (s.email2 === s.email) s.email2 = '';
    s.id = await idSquadra(s);
  }
  squadre.sort((a, b) => a.regione.localeCompare(b.regione)
    || (ORDINE_CATEGORIE.indexOf(a.categoria) + 1 || 99) - (ORDINE_CATEGORIE.indexOf(b.categoria) + 1 || 99)
    || a.girone.localeCompare(b.girone)
    || a.societa.localeCompare(b.societa));
  const presenti = new Set(squadre.map((s) => s.categoria));
  const categorie = [...ORDINE_CATEGORIE.filter((c) => presenti.has(c)), ...[...presenti].filter((c) => !ORDINE_CATEGORIE.includes(c)).sort()];

  const stati = {};
  for (const s of inOggetti(statiRighe, { email: 'Email', stato: 'Stato' })) if (s.email && s.stato) stati[s.email.toLowerCase()] = s.stato;

  return {
    squadre,
    regioni: [...new Set(squadre.map((s) => s.regione))].sort(),
    categorie,
    invii: inOggetti(inviiRighe, CAMPI_INVIO).map(daInvio).sort((a, b) => a.data.localeCompare(b.data)),
    stati,
  };
}

export async function leggiInvii() {
  const r = await chiamaGoogle(`${API}/${encodeURIComponent(idFoglio())}/values/${intervallo('Invii!A:Z')}`);
  return inOggetti(r.values || [], CAMPI_INVIO).map(daInvio);
}

async function accoda(scheda, righe) {
  await chiamaGoogle(`${API}/${encodeURIComponent(idFoglio())}/values/${intervallo(`${scheda}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    metodo: 'POST',
    corpo: { values: righe },
  });
}

export async function registraInvii(record) {
  if (record.length) await accoda('Invii', record.map(versoInvio));
}

export async function impostaStato(email, stato, da) {
  const id = encodeURIComponent(idFoglio());
  const r = await chiamaGoogle(`${API}/${id}/values/${intervallo('Stati!A:A')}`);
  const colonna = (r.values || []).map((riga) => String(riga[0] || '').toLowerCase());
  const riga = [email, stato, new Date().toISOString(), da];
  const posizione = colonna.indexOf(email);
  if (posizione > 0) {
    await chiamaGoogle(`${API}/${id}/values/${intervallo(`Stati!A${posizione + 1}:D${posizione + 1}`)}?valueInputOption=RAW`, {
      metodo: 'PUT',
      corpo: { values: [riga] },
    });
  } else {
    await accoda('Stati', [riga]);
  }
}

/** Crea un foglio nuovo con le tre schede e le intestazioni. Restituisce l'ID. */
export async function creaFoglio() {
  const schede = Object.keys(INTESTAZIONI).map((title) => ({ properties: { title, gridProperties: { frozenRowCount: 1 } } }));
  const foglio = await chiamaGoogle(API, {
    metodo: 'POST',
    corpo: { properties: { title: 'Ogni Passaggio Conta - inviti ai tornei', locale: 'it_IT' }, sheets: schede },
  });
  await chiamaGoogle(`${API}/${foglio.spreadsheetId}/values:batchUpdate`, {
    metodo: 'POST',
    corpo: {
      valueInputOption: 'RAW',
      data: Object.entries(INTESTAZIONI).map(([scheda, valori]) => ({ range: `${scheda}!A1`, values: [valori] })),
    },
  });
  return foglio.spreadsheetId;
}

const cella = (v) => ({ userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: String(v ?? '') } });

/**
 * Richieste di `spreadsheets:batchUpdate` che sostituiscono il contenuto della
 * scheda `idScheda`: prima ne svuotano i valori, poi scrivono intestazione e
 * righe dalla prima riga (appendCells aggiunge righe alla griglia se servono).
 */
export function richiesteSostituzioneSquadre(idScheda, squadre) {
  const righe = squadre.map((s) => INTESTAZIONI.Squadre.map((colonna) => {
    const campo = Object.keys(CAMPI_SQUADRA).find((k) => CAMPI_SQUADRA[k] === colonna);
    return s[campo] ?? '';
  }));
  return [
    { updateCells: { range: { sheetId: idScheda }, fields: 'userEnteredValue' } },
    {
      appendCells: {
        sheetId: idScheda,
        rows: [INTESTAZIONI.Squadre, ...righe].map((r) => ({ values: r.map(cella) })),
        fields: 'userEnteredValue',
      },
    },
  ];
}

/**
 * Sostituisce l'elenco società con il contenuto di data/squadre.json (da scripts/converti_csv.py).
 * Un solo batchUpdate: Google applica tutte le richieste o nessuna, quindi se
 * qualcosa va storto la scheda Squadre resta com'era invece di restare vuota.
 */
export async function sostituisciSquadre(squadre) {
  const id = encodeURIComponent(idFoglio());
  const info = await chiamaGoogle(`${API}/${id}?fields=${encodeURIComponent('sheets.properties(sheetId,title)')}`);
  const scheda = (info.sheets || []).find((s) => s.properties.title === 'Squadre');
  if (!scheda) throw new Error('Nel foglio manca la scheda "Squadre".');
  await chiamaGoogle(`${API}/${id}:batchUpdate`, {
    metodo: 'POST',
    corpo: { requests: richiesteSostituzioneSquadre(scheda.properties.sheetId, squadre) },
  });
}
