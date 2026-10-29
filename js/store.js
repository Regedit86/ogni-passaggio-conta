// Stato locale del browser: impostazioni, bozza del messaggio e invii non
// ancora scritti sul foglio Google (es. connessione caduta durante l'invio).
// I dati condivisi (società, storico, stati) stanno nel foglio: vedi foglio.js.
import { CONFIG } from './config.js';

const CHIAVI = {
  impostazioni: 'opc.impostazioni',
  bozza: 'opc.bozza',
  inSospeso: 'opc.inSospeso',
};

function leggi(chiave, predefinito) {
  try {
    const valore = localStorage.getItem(chiave);
    return valore ? JSON.parse(valore) : predefinito;
  } catch {
    return predefinito;
  }
}

function scrivi(chiave, valore) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
    return true;
  } catch {
    return false;
  }
}

export function impostazioni() {
  const salvate = leggi(CHIAVI.impostazioni, {});
  // i campi lasciati vuoti in Impostazioni ripiegano sui valori di config.js
  const valori = { ...CONFIG };
  for (const [k, v] of Object.entries(salvate)) if (v !== '' && v !== null && v !== undefined) valori[k] = v;
  return valori;
}

export function salvaImpostazioni(valori) {
  return scrivi(CHIAVI.impostazioni, valori);
}

export function bozza() {
  return leggi(CHIAVI.bozza, null);
}

export function salvaBozza(valori) {
  return scrivi(CHIAVI.bozza, valori);
}

export function inSospeso() {
  return leggi(CHIAVI.inSospeso, []);
}

export function salvaInSospeso(lista) {
  return scrivi(CHIAVI.inSospeso, lista);
}

/** Data locale AAAA-MM-GG di un timestamp ISO. */
export function giorno(iso) {
  return new Date(iso).toLocaleDateString('sv-SE');
}

/** Mappa email -> ultimo invio reale riuscito (esclusi i test). */
export function emailContattate(lista) {
  const mappa = new Map();
  for (const r of lista) {
    if (r.test || r.esito !== 'inviato') continue;
    const prima = mappa.get(r.email);
    if (!prima || prima.data < r.data) mappa.set(r.email, r);
  }
  return mappa;
}

/** Destinatari a cui un account ha spedito oggi (test e CC compresi: contano nel limite Gmail). */
export function inviatiOggi(lista, mittente) {
  const oggi = giorno(new Date().toISOString());
  return lista
    .filter((r) => r.esito === 'inviato' && giorno(r.data) === oggi && (!mittente || r.mittente === mittente))
    .reduce((somma, r) => somma + (r.cc ? 2 : 1), 0);
}
