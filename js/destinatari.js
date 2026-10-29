// Scelta di destinatario e CC di ogni mail, e lettura degli indirizzi scritti
// a mano. Sta in un modulo a parte, senza DOM, perché queste regole hanno test
// automatici: vedi test/destinatari.test.mjs (node --test "test/*.test.mjs").

/**
 * Destinatario (`a`) e CC di una mail per il `gruppo` (società con `email` ed
 * eventuale `email2`). In modalità test l'unico destinatario possibile è
 * `emailTest`, senza CC; se `emailTest` manca restituisce null e l'invio va
 * bloccato.
 */
export function destinatari(gruppo, { test, emailTest, ccSecondaria }) {
  if (test) return emailTest ? { a: emailTest, cc: '' } : null;
  return { a: gruppo.email, cc: ccSecondaria && gruppo.email2 ? gruppo.email2 : '' };
}

// Un solo indirizzo, come lo accetta controllaIndirizzo in google.js.
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/**
 * Indirizzi scritti a mano, uno per riga: "Nome; email" oppure solo "email".
 * Se il nome contiene a sua volta ";", l'email è dopo l'ultimo. Email in
 * minuscolo, doppioni tenuti una volta sola, righe vuote ignorate.
 */
export function leggiIndirizziManuali(testo) {
  const validi = [];
  const nonValidi = [];
  const visti = new Set();
  for (const riga of String(testo ?? '').split(/\r?\n/)) {
    if (!riga.trim()) continue;
    const separatore = riga.lastIndexOf(';');
    const nome = separatore === -1 ? '' : riga.slice(0, separatore).trim();
    const email = riga.slice(separatore + 1).trim().toLowerCase();
    if (!EMAIL.test(email)) {
      nonValidi.push(riga.trim());
      continue;
    }
    if (visti.has(email)) continue;
    visti.add(email);
    validi.push({ nome, email });
  }
  return { validi, nonValidi };
}

/** Segnaposto usati nel `testo` che per un indirizzo scritto a mano non hanno valore (tutti tranne societa). */
export function segnapostoSenzaValore(testo) {
  const chiavi = [...String(testo ?? '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(chiavi)].filter((c) => c !== 'societa');
}

/**
 * Segnaposto che bloccano l'invio: quelli senza valore, se fra i `gruppi`
 * da spedire c'è almeno un indirizzo scritto a mano. Vuoto = si può inviare.
 */
export function segnapostoBloccanti(gruppi, testo) {
  return gruppi.some((g) => g.manuale) ? segnapostoSenzaValore(testo) : [];
}

/**
 * Gruppi di invio per gli indirizzi scritti a mano (`validi` di
 * leggiIndirizziManuali), nella stessa forma delle società. Un indirizzo che è
 * già l'email di una società del foglio (`emailDelFoglio`, in minuscolo) va in
 * `giaSocieta`; con `nascondi` quelli già contattati vanno in `esclusi`.
 */
export function gruppiManuali(validi, { emailDelFoglio, contattate, stati, nascondi }) {
  const gruppi = [];
  const giaSocieta = [];
  let esclusi = 0;
  for (const { nome, email } of validi) {
    if (emailDelFoglio.has(email)) { giaSocieta.push(email); continue; }
    const contattata = contattate.get(email);
    if (nascondi && contattata) { esclusi++; continue; }
    gruppi.push({
      email,
      email2: '',
      manuale: true,
      squadre: [{ id: 'a-mano', societa: nome || email, categoria: 'a mano', regione: '', provincia: '', girone: '' }],
      contattata,
      stato: stati[email],
    });
  }
  return { gruppi, giaSocieta, esclusi };
}
