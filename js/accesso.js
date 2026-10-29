// Riquadro "account Google" condiviso dalle pagine, e caricamento dei dati
// dal foglio con il recupero degli invii rimasti in sospeso.
import { CONFIG } from './config.js';
import * as store from './store.js';
import * as foglio from './foglio.js';
import { accedi, esci, utente } from './google.js';
import { escape, avviso } from './ui.js';

/**
 * Vero se l'account collegato può usare la pagina Impostazioni. La lista (di
 * impronte SHA-256 delle email) viene solo da config.js, mai dalle impostazioni
 * salvate nel browser.
 */
export function amministratore() {
  const lista = (CONFIG.amministratori || []).map((e) => e.toLowerCase());
  if (!lista.length) return true;
  const u = utente();
  return Boolean(u?.impronta && lista.includes(u.impronta));
}

/** Link alla pagina Impostazioni, o un rimando a chi può usarla. */
function rimandoImpostazioni() {
  return amministratore() ? '<a href="impostazioni.html">Impostazioni</a>' : 'Impostazioni (chiedi a un amministratore)';
}

/**
 * Disegna il riquadro account in `box`. `alCambio` viene chiamata dopo
 * accesso o uscita, per ricaricare la pagina.
 */
export function disegnaAccount(box, alCambio) {
  const imp = store.impostazioni();
  const u = utente();
  for (const voce of document.querySelectorAll('[data-solo-admin]')) voce.hidden = !amministratore();
  if (!imp.googleClientId) {
    box.innerHTML = `<p class="nota attenzione">Per accedere serve il <strong>Google Client ID</strong> del progetto. Inseriscilo in <a href="impostazioni.html">Impostazioni</a>; la procedura per crearlo è nel README.<br>Origine da autorizzare su Google Cloud: <code>${escape(location.origin)}</code></p>`;
    return;
  }
  if (u) {
    const ora = new Date(u.scade).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `<div class="account">
      ${u.foto ? `<img src="${escape(u.foto)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div class="chi"><strong>${escape(u.nome || u.email)}</strong><span>${escape(u.email)} · accesso valido fino alle ${ora}</span></div>
      <button class="btn secondario piccolo" data-azione="cambia">Cambia account</button>
      <button class="btn link" data-azione="esci">Esci</button></div>`;
  } else {
    box.innerHTML = `<div class="account"><div class="chi"><strong>Nessun account collegato</strong><span>Accedi con un account Google che ha accesso al foglio condiviso.</span></div>
      <button class="btn prugna" data-azione="accedi">Accedi con Google</button></div>`;
  }
  box.onclick = async (e) => {
    const azione = e.target.closest('[data-azione]')?.dataset.azione;
    if (!azione) return;
    if (azione === 'esci') {
      esci();
    } else {
      try {
        const nuovo = await accedi(imp.googleClientId);
        avviso(`Collegato come ${nuovo.email}`, 'ok');
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }
    disegnaAccount(box, alCambio);
    alCambio?.();
  };
}

/** Scrive sul foglio gli invii rimasti in locale. Restituisce quanti ne restano. */
export async function recuperaInSospeso() {
  const lista = store.inSospeso();
  if (!lista.length) return 0;
  try {
    await foglio.registraInvii(lista);
    store.salvaInSospeso([]);
    avviso(`${lista.length} invii in sospeso salvati sul foglio`, 'ok');
    return 0;
  } catch {
    return lista.length;
  }
}

/**
 * Carica i dati del foglio mostrando lo stato in `nota`. Gli invii ancora in
 * sospeso vengono uniti allo storico, così contano come già contattati.
 * Restituisce null se manca l'accesso o il foglio.
 */
export async function caricaDati(nota) {
  const imp = store.impostazioni();
  nota.hidden = false;
  if (!utente()) {
    nota.className = 'nota';
    nota.textContent = 'Accedi con Google per caricare società e storico dal foglio condiviso.';
    return null;
  }
  if (!imp.idFoglio) {
    nota.className = 'nota attenzione';
    nota.innerHTML = `Manca l'ID del foglio Google con i dati: impostalo (o crea il foglio) in ${rimandoImpostazioni()}.`;
    return null;
  }
  nota.className = 'nota';
  nota.textContent = 'Caricamento dei dati dal foglio Google…';
  try {
    const sospesi = await recuperaInSospeso();
    const dati = await foglio.leggiTutto();
    if (sospesi) dati.invii.push(...store.inSospeso());
    nota.className = sospesi ? 'nota attenzione' : 'nota';
    nota.innerHTML = `${dati.squadre.length.toLocaleString('it-IT')} squadre in ${dati.regioni.length} regioni · ${dati.invii.length.toLocaleString('it-IT')} invii nello storico · <a href="${escape(foglio.urlFoglio())}" target="_blank" rel="noopener">apri il foglio</a>`
      + (sospesi ? `<br><strong>${sospesi} invii non ancora salvati sul foglio</strong>: restano in questo browser e verranno salvati al prossimo caricamento.` : '');
    if (!dati.squadre.length) {
      nota.className = 'nota attenzione';
      nota.innerHTML += `<br>La scheda "Squadre" è vuota: caricala da ${rimandoImpostazioni()}.`;
    }
    return dati;
  } catch (e) {
    nota.className = 'nota errore';
    nota.textContent = e.message;
    return null;
  }
}
