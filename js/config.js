// Valori predefiniti. Ogni valore si può cambiare dalla pagina Impostazioni
// (salvato nel browser); qui si cambia il default per tutti.
export const CONFIG = {
  // OAuth Client ID di tipo "Applicazione web" creato su Google Cloud Console.
  googleClientId: '891908247100-uh750443i0cca22q08kte6gi9bijbh86.apps.googleusercontent.com',
  // ID del foglio Google con società, storico invii e stati (vedi README).
  idFoglio: '1pNxwy7Pt-ks4BA0W7FL5VBYH7NRBL_XsPIy2nX0ZAI8',
  // Account Google che vedono la pagina Impostazioni, come impronta SHA-256
  // dell'email in minuscolo: l'indirizzo non compare in chiaro, ma chi già lo
  // conosce può verificarlo (è uno pseudonimo, non un segreto).
  //   python -c "import hashlib;print(hashlib.sha256(b'nome@gmail.com').hexdigest())"
  // Lista vuota: tutti. È un filtro dell'interfaccia: la protezione vera è sul
  // foglio (scheda Squadre protetta, condivisione). Non si cambia dalla pagina Impostazioni.
  amministratori: ['d10fea37b71cae1d733e97b53b62228ecdf76a146258a26aa6a08a3f5ac3e050'],
  // In modalità test tutte le mail vanno qui, mai alle società.
  // Se vuoto, all'account Google con cui si è fatto l'accesso.
  emailTest: '',
  nomeMittente: 'Ogni Passaggio Conta',
  // Se vuoto, le risposte tornano all'account che invia.
  replyTo: '',
  // Pausa tra un invio e il successivo (minimo 2: ogni invio scrive anche sul foglio).
  pausaSecondi: 2,
  // Gmail gratuito: 500 destinatari al giorno. Si resta sotto con margine.
  limiteGiornaliero: 450,
  // In modalità test si inviano solo le prime N mail della selezione.
  maxInviiTest: 3,
};
