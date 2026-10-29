// Accesso con Google (Google Identity Services, token client OAuth 2.0),
// invio tramite Gmail API e chiamate autenticate alle altre API Google.
// Tutto gira nel browser: nessun server, nessuna password salvata. Il token
// dura circa un'ora e resta solo nella scheda del browser (sessionStorage).
import { byteInBase64 } from './allegati.js';

const SCOPE_INVIO = 'https://www.googleapis.com/auth/gmail.send';
const SCOPE_FOGLI = 'https://www.googleapis.com/auth/spreadsheets';
const SCOPE = `${SCOPE_INVIO} ${SCOPE_FOGLI} openid email profile`;
const CHIAVE_SESSIONE = 'opc.sessione';

let sessione = leggiSessione();

function leggiSessione() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHIAVE_SESSIONE) || 'null');
    // una sessione aperta con permessi diversi da quelli attuali (o da una
    // versione precedente, senza impronta) va rifatta
    return s && s.scade > Date.now() && s.scope === SCOPE && s.impronta ? s : null;
  } catch {
    return null;
  }
}

function salvaSessione(s) {
  sessione = s;
  try {
    if (s) sessionStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(s));
    else sessionStorage.removeItem(CHIAVE_SESSIONE);
  } catch {
    // sessionStorage non disponibile: la sessione resta in memoria
  }
}

function caricaGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Impossibile caricare la libreria di accesso Google. Controlla la connessione.'));
    document.head.appendChild(script);
  });
}

/** Utente connesso con token ancora valido, oppure null. */
export function utente() {
  if (sessione && sessione.scade <= Date.now()) salvaSessione(null);
  return sessione ? { email: sessione.email, impronta: sessione.impronta, nome: sessione.nome, foto: sessione.foto, scade: sessione.scade } : null;
}

/** Apre il popup Google. Va chiamata da un click, altrimenti il browser blocca il popup. */
export async function accedi(clientId, { scegliAccount = true } = {}) {
  if (!clientId) throw new Error('Manca il Google Client ID: impostalo nella pagina Impostazioni.');
  await caricaGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: async (risposta) => {
        if (risposta.error) return reject(new Error(risposta.error_description || risposta.error));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(risposta, SCOPE_INVIO, SCOPE_FOGLI)) {
          return reject(new Error('Servono entrambi i permessi (invio email e fogli Google): riaccedi e lascia spuntate tutte le caselle.'));
        }
        try {
          const profilo = await leggiProfilo(risposta.access_token);
          salvaSessione({
            impronta: await impronta(profilo.email),
            token: risposta.access_token,
            scade: Date.now() + (Number(risposta.expires_in) - 60) * 1000,
            email: profilo.email,
            nome: profilo.name || '',
            foto: profilo.picture || '',
            scope: SCOPE,
          });
          resolve(utente());
        } catch (e) {
          reject(e);
        }
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Finestra di accesso chiusa.' : e?.message || 'Accesso non riuscito.')),
    });
    client.requestAccessToken({ prompt: scegliAccount ? 'select_account' : '', login_hint: sessione?.email });
  });
}

export function esci() {
  const token = sessione?.token;
  salvaSessione(null);
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
}

/** Impronta SHA-256 (esadecimale) dell'email in minuscolo: vedi `amministratori` in config.js. */
async function impronta(email) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function leggiProfilo(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('Impossibile leggere il profilo Google.');
  return r.json();
}

/** Chiamata autenticata a un'API Google; restituisce il JSON della risposta. */
export async function chiamaGoogle(url, { metodo = 'GET', corpo } = {}) {
  if (!utente()) throw new ErroreGoogle('Sessione Google scaduta: accedi di nuovo.', 'sessione');
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${sessione.token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroreGoogle('Errore di rete: controlla la connessione.', 'altro');
  }
  if (r.ok) return r.status === 204 ? {} : r.json();
  let dettaglio = {};
  try {
    dettaglio = (await r.json()).error || {};
  } catch {
    // risposta non JSON
  }
  if (r.status === 401) {
    salvaSessione(null);
    throw new ErroreGoogle('Sessione Google scaduta: accedi di nuovo.', 'sessione');
  }
  if (r.status === 429) throw new ErroreGoogle('Troppe richieste a Google: riprova tra un minuto.', 'limite');
  if (r.status === 403 || r.status === 404) {
    throw new ErroreGoogle(`Accesso negato o foglio inesistente: controlla l'ID del foglio e che sia condiviso con il tuo account. (${dettaglio.message || r.status})`, 'permesso');
  }
  throw new ErroreGoogle(dettaglio.message || `HTTP ${r.status}`, 'altro');
}

// --- MIME -----------------------------------------------------------------

function base64Utf8(testo) {
  return byteInBase64(new TextEncoder().encode(testo));
}

function righe76(b64) {
  return b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function intestazione(testo) {
  return /^[\x20-\x7e]*$/.test(testo) ? testo : `=?UTF-8?B?${base64Utf8(testo)}?=`;
}

/**
 * Rifiuta un indirizzo che non sia uno solo e valido: un a capo, una virgola o
 * un punto e virgola presi dal foglio aggiungerebbero intestazioni o destinatari.
 */
function controllaIndirizzo(email) {
  if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(email)) {
    throw new ErroreGoogle(`Indirizzo non valido: "${email}"`, 'destinatario');
  }
  return email;
}

function indirizzo(nome, email) {
  return nome ? `${intestazione(nome.replace(/"/g, ''))} <${email}>` : email;
}

/**
 * Nome di file da mettere tra virgolette in un'intestazione: niente a capo,
 * virgolette o caratteri di controllo, che aggiungerebbero intestazioni.
 */
function nomeFile(nome) {
  const pulito = String(nome).replace(/[\x00-\x1f\x7f"\\]/g, '').trim() || 'allegato';
  return intestazione(pulito);
}

/** Tipo MIME dichiarato dal browser, se ha la forma tipo/sottotipo; altrimenti generico. */
const tipoFile = (tipo) => (/^[\w.+-]+\/[\w.+-]+$/.test(tipo || '') ? tipo : 'application/octet-stream');

/**
 * Mail con testo e HTML alternativi. Le `immagini` ({cid, tipo, nome, base64})
 * vanno in linea: l'HTML le richiama con src="cid:<cid>". Gli `allegati`
 * ({nome, tipo, base64}) chiudono la mail come file da scaricare.
 */
export function costruisciMime({ da, nomeDa, a, cc, replyTo, oggetto, html, testo, immagini = [], allegati = [] }) {
  const confine = `opc_${Math.random().toString(36).slice(2)}`;
  const confineRelated = `${confine}_rel`;
  const confineMixed = `${confine}_mix`;
  const header = [
    `From: ${indirizzo(nomeDa, controllaIndirizzo(da))}`,
    `To: ${controllaIndirizzo(a)}`,
    cc ? `Cc: ${controllaIndirizzo(cc)}` : '',
    replyTo ? `Reply-To: ${controllaIndirizzo(replyTo)}` : '',
    `Subject: ${intestazione(oggetto)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);
  const tipoAlternative = `Content-Type: multipart/alternative; boundary="${confine}"`;
  const parte = (tipo, contenuto) => [
    `--${confine}`,
    `Content-Type: ${tipo}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    righe76(base64Utf8(contenuto)),
  ].join('\r\n');
  const alternative = [parte('text/plain', testo), parte('text/html', html), `--${confine}--`].join('\r\n');
  const immagine = (i) => [
    `--${confineRelated}`,
    `Content-Type: ${i.tipo}; name="${i.nome}"`,
    'Content-Transfer-Encoding: base64',
    `Content-ID: <${i.cid}>`,
    `Content-Disposition: inline; filename="${i.nome}"`,
    '',
    righe76(i.base64),
  ].join('\r\n');
  // Il messaggio vero e proprio: solo testo + HTML, o dentro "related" con le immagini in linea.
  const contenuto = !immagini.length ? [tipoAlternative, '', alternative] : [
    `Content-Type: multipart/related; type="multipart/alternative"; boundary="${confineRelated}"`,
    '',
    `--${confineRelated}`,
    tipoAlternative,
    '',
    alternative,
    ...immagini.map(immagine),
    `--${confineRelated}--`,
  ];
  if (!allegati.length) return [...header, ...contenuto, ''].join('\r\n');

  const allegato = (f) => [
    `--${confineMixed}`,
    `Content-Type: ${tipoFile(f.tipo)}; name="${nomeFile(f.nome)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${nomeFile(f.nome)}"`,
    '',
    righe76(f.base64),
  ].join('\r\n');
  return [
    ...header,
    `Content-Type: multipart/mixed; boundary="${confineMixed}"`,
    '',
    `--${confineMixed}`,
    ...contenuto,
    ...allegati.map(allegato),
    `--${confineMixed}--`,
    '',
  ].join('\r\n');
}

// --- Invio ----------------------------------------------------------------

export class ErroreGoogle extends Error {
  constructor(messaggio, tipo) {
    super(messaggio);
    // tipo: 'sessione' (riaccedere), 'limite' (fermarsi), 'destinatario' (saltare), 'permesso', 'altro'
    this.tipo = tipo;
  }
}

export async function inviaEmail(messaggio) {
  const u = utente();
  if (!u) throw new ErroreGoogle('Sessione Google scaduta: accedi di nuovo.', 'sessione');
  const mime = costruisciMime({ ...messaggio, da: u.email });
  const raw = base64Utf8(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // Non usare l'endpoint di upload (/upload/gmail/...): spedisce la mail ma la
  // sua risposta non ha l'intestazione CORS, quindi il browser la blocca e
  // l'invio risulterebbe fallito anche se la mail è partita.
  let r;
  try {
    r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessione.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
  } catch {
    throw new ErroreGoogle('Errore di rete durante l\'invio.', 'altro');
  }
  if (r.ok) return r.json();

  let dettaglio = {};
  try {
    dettaglio = (await r.json()).error || {};
  } catch {
    // risposta non JSON
  }
  const testo = dettaglio.message || `HTTP ${r.status}`;
  const motivo = dettaglio.errors?.[0]?.reason || '';
  if (r.status === 401) {
    salvaSessione(null);
    throw new ErroreGoogle('Sessione Google scaduta: accedi di nuovo.', 'sessione');
  }
  // solo 403/429: un 400 "message too large… limit" non è il limite giornaliero
  if (r.status === 429 || (r.status === 403 && /limit|quota/i.test(motivo + testo))) {
    throw new ErroreGoogle(`Limite di invio Gmail raggiunto: ${testo}`, 'limite');
  }
  if (r.status === 400 && /recipient|address|invalid to/i.test(testo)) {
    throw new ErroreGoogle(`Indirizzo rifiutato: ${testo}`, 'destinatario');
  }
  throw new ErroreGoogle(testo, 'altro');
}
