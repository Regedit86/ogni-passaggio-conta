// Allegati della mail: controlli prima di accettarli e conversione in base64.
// Nessun import e nessuna API del browser: si usa anche da google.js e nei test.

/** Totale massimo degli allegati di una mail. */
export const LIMITE_ALLEGATI = 10 * 1024 * 1024;

// Estensioni che Gmail rifiuta come allegato.
export const ESTENSIONI_BLOCCATE = new Set([
  'ade', 'adp', 'apk', 'appx', 'appxbundle', 'bat', 'cab', 'chm', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'ex', 'ex_', 'exe',
  'hta', 'ins', 'isp', 'iso', 'jar', 'js', 'jse', 'lib', 'lnk', 'mde', 'msc', 'msi', 'msix', 'msixbundle', 'msp', 'mst',
  'nsh', 'pif', 'ps1', 'scr', 'sct', 'shb', 'sys', 'vb', 'vbe', 'vbs', 'vxd', 'wsc', 'wsf', 'wsh',
]);

/** Byte -> base64, a blocchi per non superare il limite di argomenti di String.fromCharCode. */
export function byteInBase64(byte) {
  let binario = '';
  for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Dimensione leggibile: "1,2 MB" o "350 KB" (minimo 1 KB). */
export function formatoDimensione(byte) {
  if (byte >= 1024 * 1024) return `${(byte / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(byte / 1024)).toLocaleString('it-IT')} KB`;
}

/**
 * Decide quali dei `nuovi` file ({nome, dimensione}) si possono aggiungere a
 * quelli `esistenti`. I nuovi si esaminano nell'ordine: il limite e i doppioni
 * contano anche quelli già accettati in questa stessa scelta.
 */
export function valutaAllegati(esistenti, nuovi) {
  const nomi = new Set(esistenti.map((f) => f.nome.toLowerCase()));
  let totale = esistenti.reduce((somma, f) => somma + f.dimensione, 0);
  const accettati = [];
  const scartati = [];
  for (const f of nuovi) {
    const estensione = f.nome.includes('.') ? f.nome.split('.').pop().toLowerCase() : '';
    let motivo = '';
    if (!f.dimensione) motivo = 'il file è vuoto';
    else if (ESTENSIONI_BLOCCATE.has(estensione)) motivo = `Gmail non accetta file .${estensione}`;
    else if (nomi.has(f.nome.toLowerCase())) motivo = 'è già allegato';
    else if (totale + f.dimensione > LIMITE_ALLEGATI) motivo = `si supererebbe il limite di ${formatoDimensione(LIMITE_ALLEGATI)} in totale`;
    if (motivo) {
      scartati.push({ nome: f.nome, motivo });
      continue;
    }
    accettati.push(f);
    nomi.add(f.nome.toLowerCase());
    totale += f.dimensione;
  }
  return { accettati, scartati };
}
