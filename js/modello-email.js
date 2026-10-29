// Testo predefinito, segnaposto e impaginazione HTML della mail.
import { byteInBase64 } from './allegati.js';

export const SEGNAPOSTO = [
  { chiave: 'societa', descrizione: 'Nome della società' },
  { chiave: 'categoria', descrizione: 'Categoria (es. Promozione)' },
  { chiave: 'regione', descrizione: 'Regione' },
  { chiave: 'provincia', descrizione: 'Sigla provincia' },
  { chiave: 'girone', descrizione: 'Girone' },
];

export const MODELLO_PREDEFINITO = {
  campagna: 'Tornei misti 2026 - invito',
  oggetto: 'Ogni Passaggio Conta: invito ai tornei misti contro la violenza di genere',
  corpo: `Gentile {{societa}},

siamo **Ogni Passaggio Conta**, un movimento di ragazze e ragazzi volontari che da più di quattro anni porta nello sport la sensibilizzazione sulla violenza di genere, promuovendo parità e rispetto.

Organizziamo **tornei misti**: uomini e donne giocano insieme, e la giornata alterna partite, laboratori e talk con psicologhe, associazioni e testimonianze dirette. Chi partecipa non sa con chi giocherà, ma sa il perché.

Nel 2025 più di 200 società hanno aderito al progetto della Fascia da capitan*, e il nostro primo torneo misto per adulti ha coinvolto oltre 300 persone.

Ci farebbe piacere avere anche voi, come società di {{categoria}}, ai prossimi tornei di sensibilizzazione. Se siete interessati rispondete a questa mail: vi mandiamo date, luoghi e modalità di partecipazione.

Grazie per l'attenzione,
lo staff di Ogni Passaggio Conta`,
};

const COLORI = { cremisi: '#D4204D', prugna: '#6D586F', lilla: '#C49ECA', acqua: '#9ED6D7', ciano: '#B4F5F6' };

export function sostituisci(testo, dati) {
  return testo.replace(/\{\{\s*(\w+)\s*\}\}/g, (tutto, chiave) => (chiave in dati ? dati[chiave] : tutto));
}

/** Segnaposto non riconosciuti, per avvisare prima dell'invio. */
export function segnapostoSconosciuti(testo) {
  const validi = new Set(SEGNAPOSTO.map((s) => s.chiave));
  return [...testo.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((c) => !validi.has(c));
}

function escape(testo) {
  return testo.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// --- Marcatori --------------------------------------------------------------
// Il testo si scrive con pochi marcatori (barra sopra il campo Testo):
//   **grassetto**  *corsivo*  __sottolineato__  [testo](https://…)
//   "- " a inizio riga = elenco, "## " a inizio riga = titoletto.
// Link, URL e segnaposto vengono messi da parte prima dei marcatori, così un
// "__" dentro un indirizzo o un "*" nel nome di una società restano com'erano.

// \u0000 è escluso: delimita i pezzi già messi da parte (vedi inLinea)
const LINK = /\[([^\]\n\u0000]+)\]\(([^()\s\u0000]+)\)/g;
const URL_NUDO = /https?:\/\/[^\s<>"\u0000]+/g;
const SEGNAPOSTO_IN_TESTO = /\{\{\s*(\w+)\s*\}\}/g;
const URL_AMMESSO = /^(https?:\/\/|mailto:)[^\s"<>]+$/i;

const MARCATORI = [
  { re: /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, html: `<strong style="color:${COLORI.prugna}"><em>$1</em></strong>` },
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/g, html: `<strong style="color:${COLORI.prugna}">$1</strong>` },
  { re: /__(?=\S)(.+?)(?<=\S)__/g, html: '<u>$1</u>' },
  // l'asterisco singolo vale solo se non è attaccato a una parola: "capitan*" resta com'è
  { re: /(?<![\p{L}\p{N}*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\p{L}\p{N}*])/gu, html: '<em>$1</em>' },
];

/** Una riga di testo con i marcatori in linea, in HTML (`html` vero) o in solo testo. */
function inLinea(riga, dati, html) {
  const pezzi = [];
  const metti = (valore) => `\u0000${pezzi.push(valore) - 1}\u0000`;
  // in un indirizzo i valori dei segnaposto vanno codificati (spazi, &, …)
  const inIndirizzo = (url) => url.replace(SEGNAPOSTO_IN_TESTO, (tutto, chiave) => (dati && chiave in dati ? encodeURIComponent(dati[chiave]) : tutto));
  const link = (url, testo) => {
    if (html) return `<a href="${escape(url)}" style="color:${COLORI.cremisi}">${escape(testo)}</a>`;
    return testo === url ? url : `${testo} (${url})`;
  };

  let t = riga.replace(/\u0000/g, '')
    // "{{ societa }}" scritto a mano diventa "{{societa}}", così non spezza un indirizzo
    .replace(SEGNAPOSTO_IN_TESTO, '{{$1}}')
    .replace(LINK, (tutto, testo, url) => {
      const indirizzo = inIndirizzo(url);
      return URL_AMMESSO.test(indirizzo) ? metti(link(indirizzo, sostituisci(testo, dati || {}))) : tutto;
    })
    .replace(URL_NUDO, (url) => {
      // la punteggiatura finale appartiene alla frase, non all'indirizzo
      const fine = url.match(/[.,;:!?)]+$/)?.[0] || '';
      const pulito = inIndirizzo(url.slice(0, url.length - fine.length));
      return metti(link(pulito, pulito)) + fine;
    })
    .replace(SEGNAPOSTO_IN_TESTO, (tutto, chiave) => {
      if (!dati || !(chiave in dati)) return tutto;
      return metti(html ? escape(String(dati[chiave])) : String(dati[chiave]));
    });

  if (html) t = escape(t);
  for (const m of MARCATORI) t = t.replace(m.re, html ? m.html : '$1');
  return t.replace(/\u0000(\d+)\u0000/g, (tutto, i) => pezzi[i]);
}

const VOCE = /^\s*-\s+(.+)$/;
const TITOLETTO = /^\s*##\s+(.+)$/;

/**
 * Corpo della mail in blocchi HTML: paragrafi (righe unite da <br>, chiusi da
 * una riga vuota), elenchi e titoletti. I blocchi non si annidano mai.
 */
function blocchiHtml(corpo, dati) {
  const html = [];
  let paragrafo = [];
  let elenco = [];
  const chiudiParagrafo = () => {
    if (paragrafo.length) html.push(`<p style="margin:0 0 16px">${paragrafo.join('<br>')}</p>`);
    paragrafo = [];
  };
  const chiudiElenco = () => {
    if (elenco.length) html.push(`<ul style="margin:0 0 16px;padding-left:22px">${elenco.map((v) => `<li style="margin:0 0 6px">${v}</li>`).join('')}</ul>`);
    elenco = [];
  };
  for (const riga of corpo.replace(/\r\n?/g, '\n').split('\n')) {
    const voce = riga.match(VOCE);
    const titolo = riga.match(TITOLETTO);
    if (!riga.trim()) {
      chiudiParagrafo();
      chiudiElenco();
    } else if (voce) {
      chiudiParagrafo();
      elenco.push(inLinea(voce[1], dati, true));
    } else if (titolo) {
      chiudiParagrafo();
      chiudiElenco();
      html.push(`<p style="margin:8px 0 10px;font-size:18px;line-height:1.3;font-weight:700;color:${COLORI.cremisi}">${inLinea(titolo[1], dati, true)}</p>`);
    } else {
      chiudiElenco();
      paragrafo.push(inLinea(riga, dati, true));
    }
  }
  chiudiParagrafo();
  chiudiElenco();
  return html.join('');
}

/** Versione solo testo della mail: marcatori tolti, link come "testo (indirizzo)". */
export function testoSemplice(corpo, dati) {
  const righe = corpo.replace(/\r\n?/g, '\n').split('\n').map((riga) => {
    const voce = riga.match(VOCE);
    const titolo = riga.match(TITOLETTO);
    if (voce) return `- ${inLinea(voce[1], dati, false)}`;
    if (titolo) return inLinea(titolo[1], dati, false);
    return inLinea(riga, dati, false);
  });
  return `${righe.join('\n')}\n\n--\nOgni Passaggio Conta\nInstagram @ognipassaggioconta · ognipassaggioconta@gmail.com\n`;
}

// Il logo viaggia dentro la mail come immagine in linea (Content-ID), così si
// vede senza dipendere da un indirizzo pubblico e senza "mostra immagini".
export const CID_LOGO = 'logo-opc';
export const SRC_LOGO_MAIL = `cid:${CID_LOGO}`;
export const SRC_LOGO_ANTEPRIMA = 'assets/logo-email.png';

/** Legge il logo per allegarlo in linea; null se non si riesce a caricarlo. */
export async function caricaLogo() {
  try {
    const r = await fetch(SRC_LOGO_ANTEPRIMA);
    if (!r.ok) return null;
    const base64 = byteInBase64(new Uint8Array(await r.arrayBuffer()));
    return { cid: CID_LOGO, tipo: 'image/png', nome: 'logo-ogni-passaggio-conta.png', base64 };
  } catch {
    return null;
  }
}

/**
 * Mail HTML compatibile con i client di posta: tabelle e stili in linea.
 * `logo` è l'indirizzo dell'immagine; se vuoto la testata è solo testo.
 */
export function htmlEmail(corpo, { logo = '', dati } = {}) {
  const testata = logo
    ? `<img src="${escape(logo)}" width="120" alt="Ogni Passaggio Conta" style="display:block;border:0;width:120px;height:auto">`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.1;color:${COLORI.prugna}"><span style="font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px">OGNI</span><br>passaggio<br><span style="font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px">CONTA</span></div>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4eef5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4eef5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="height:8px;background:${COLORI.cremisi};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="height:6px;background:${COLORI.lilla};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="height:6px;background:${COLORI.ciano};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 36px 8px">${testata}</td></tr>
<tr><td style="padding:16px 36px 12px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${COLORI.prugna}">${blocchiHtml(corpo, dati)}</td></tr>
<tr><td style="padding:18px 36px 26px;background:${COLORI.acqua};font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${COLORI.prugna}">
<strong style="color:${COLORI.cremisi}">Insieme ogni passaggio conta di più</strong><br>
Instagram <a href="https://www.instagram.com/ognipassaggioconta" style="color:${COLORI.prugna}">@ognipassaggioconta</a> · <a href="mailto:ognipassaggioconta@gmail.com" style="color:${COLORI.prugna}">ognipassaggioconta@gmail.com</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
