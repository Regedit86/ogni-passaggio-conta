// Piccole utilità condivise dalle pagine.

export function escape(testo) {
  return String(testo ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (selettore, radice = document) => radice.querySelector(selettore);
export const $$ = (selettore, radice = document) => [...radice.querySelectorAll(selettore)];

let timerAvviso;
export function avviso(testo, tipo = 'info') {
  let box = $('#avviso');
  if (!box) {
    box = document.createElement('div');
    box.id = 'avviso';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  box.textContent = testo;
  box.className = `avviso avviso-${tipo} visibile`;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => box.classList.remove('visibile'), tipo === 'errore' ? 7000 : 3500);
}

export function dataOra(iso) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function numero(n) {
  return n.toLocaleString('it-IT');
}

export function scarica(nomeFile, contenuto, tipo) {
  const url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csv(righe) {
  const cella = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM + separatore ';' per aprirlo direttamente con Excel in italiano
  return `﻿${righe.map((r) => r.map(cella).join(';')).join('\r\n')}`;
}

export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
