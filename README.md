# Ogni Passaggio Conta · inviti ai tornei

Sito statico (pubblicabile su GitHub Pages) per mandare dal proprio account Gmail l'invito ai tornei misti di sensibilizzazione alle società di calcio, filtrando per regione e categoria, e tenere traccia di chi è già stato contattato.

- `index.html`: selezione destinatari, messaggio con segnaposto, anteprima, invio (con modalità test).
- `dashboard.html`: copertura per regione e categoria, invii per giorno, storico con lo stato di ogni società (interessata, aderito…), export CSV.
- `impostazioni.html`: Client ID Google, foglio dati, mittente, limiti, caricamento dell'elenco società.

## Dove stanno i dati

Il sito pubblicato **non contiene dati**. Elenco società, storico invii e stati stanno in un **foglio Google privato** con tre schede:

| Scheda | Contenuto |
|---|---|
| `Squadre` | Elenco società (Regione, Categoria, Girone, Società, Provincia, Sede, Telefono, Email, Email secondaria, Sito, Scheda tuttocampo) |
| `Invii` | Una riga per ogni mail spedita, da chiunque del team |
| `Stati` | Esito per società (Interessata, Aderito, …) |

Il sito legge e scrive il foglio con l'account Google di chi accede. Se l'account non ha ricevuto la condivisione del foglio, non vede nulla. Per dare o togliere accesso a qualcuno basta condividere o smettere di condividere il foglio da Google Sheets.

Lo storico è condiviso: prima di ogni invio il sito rilegge il foglio e salta le società contattate nel frattempo da altri. Se la scrittura sul foglio fallisce (es. connessione caduta), l'invio resta salvato nel browser e viene scritto al caricamento successivo.

## Come funziona l'invio

Nessun server e nessuna password. Chi usa il sito clicca **Accedi con Google**, sceglie l'account e concede due permessi: `gmail.send` (spedire) e `spreadsheets` (leggere e scrivere il foglio). Il sito spedisce tramite Gmail API: le mail risultano inviate da quell'account e compaiono nella sua cartella "Inviati". Il permesso scade dopo un'ora; poi basta riaccedere.

Limiti di Gmail: **500 destinatari al giorno** per account gratuito (2.000 con Google Workspace), su una finestra di 24 ore. Il sito si ferma a 450 per account (modificabile) e fa una pausa di 2 secondi tra una mail e l'altra. Le società con la stessa email ricevono una sola mail.

### Indirizzi scritti a mano

Nella pagina Invio, sotto la tabella delle società, il campo **Indirizzi aggiunti a mano** accetta destinatari fuori dall'elenco, uno per riga: `Pro Loco Verona; info@prolocovr.it` oppure solo `info@prolocovr.it`.
- Compaiono in cima alla tabella, segnati "a mano", indipendentemente da regione, categoria e ricerca, e si selezionano come le società.
- Ricevono lo stesso messaggio e gli stessi allegati, e finiscono nella scheda `Invii` (quindi nello storico della dashboard) con il nome, la regione vuota e la categoria "a mano". Dopo un invio reale risultano già contattati come le società.
- Il nome va nel segnaposto `{{societa}}` (senza nome, l'indirizzo). Gli altri segnaposto per questi indirizzi non hanno valore: se il testo li usa, l'invio è bloccato finché non li togli o non deselezioni gli indirizzi a mano. Il testo predefinito usa `{{categoria}}`.
- Un indirizzo che è già l'email di una società del foglio viene escluso: si seleziona dalla tabella.
- Restano salvati nel browser insieme alla bozza del messaggio.

### Formattazione del testo

I pulsanti sopra il campo **Testo** (o Ctrl+B, Ctrl+I, Ctrl+U) scrivono dei segni che nella mail diventano formattazione; nella versione solo testo della mail vengono tolti.

| Scrivi | Nella mail |
|---|---|
| `**testo**` | **grassetto** |
| `*testo*` | *corsivo* (un asterisco attaccato a una parola, come in "capitan\*", resta un asterisco) |
| `__testo__` | sottolineato |
| `[testo](https://…)` | link sul testo; ammessi solo indirizzi `https://`, `http://` e `mailto:` |
| `- ` a inizio riga | elenco puntato (righe consecutive) |
| `## ` a inizio riga | titoletto |

Gli indirizzi scritti per intero diventano link da soli. I segni non hanno effetto dentro i link né sui dati dei segnaposto: un nome di società con un asterisco resta com'è.

### Allegati

Con **Allega file** si aggiungono file che partono con **tutte** le mail dell'invio, anche in modalità test.
- Fino a **10 MB in totale**. I file che Gmail non accetta (`.exe`, `.bat`, `.js` e simili) vengono scartati subito, con il motivo.
- **Non vengono salvati**: se ricarichi la pagina vanno scelti di nuovo. Oggetto e testo invece restano.
- Ogni mail ricarica gli allegati su Gmail: con molti invii sono molti dati (450 mail con 3 MB di allegati sono circa 1,3 GB). Sulle mail a chi non vi conosce, inoltre, gli allegati aumentano il rischio di finire nello spam. Per i file grandi conviene un link, per esempio a un PDF su Google Drive condiviso con "Chiunque abbia il link".
- La conferma dell'invio reale riporta quanti allegati partono; se cambi gli allegati, la conferma va ridata.

## Configurazione una tantum: Google Cloud

1. Vai su <https://console.cloud.google.com/>, accedi con un account Google qualsiasi (non serve che sia quello che spedirà) e crea un progetto (es. "OPC inviti"). Conviene aggiungere un secondo proprietario da **IAM → Concedi accesso**. Se usi un account aziendale, l'organizzazione potrebbe bloccare la creazione di progetti o di app esterne: in quel caso usa un Gmail personale.
2. **API e servizi → Libreria**: abilita **Gmail API** e **Google Sheets API**.
3. **API e servizi → Schermata consenso OAuth** (Google Auth Platform):
   - tipo utente **Esterno** (con "Interno" potrebbero accedere solo gli account dell'organizzazione, e i Gmail resterebbero fuori), nome app "Ogni Passaggio Conta", email di supporto;
   - in **Accesso ai dati / Ambiti** aggiungi `.../auth/gmail.send` e `.../auth/spreadsheets`;
   - in **Pubblico / Utenti di test** aggiungi ogni account che userà il sito (es. `ognipassaggioconta@gmail.com` e gli account personali del team). Finché l'app resta "In test" possono accedere solo questi account, fino a 100. È un secondo livello di protezione oltre alla condivisione del foglio.
4. **API e servizi → Credenziali → Crea credenziali → ID client OAuth**:
   - tipo **Applicazione web**;
   - **Origini JavaScript autorizzate**: `http://localhost:8080` (prova in locale) e, dopo la pubblicazione, `https://<utente>.github.io` (solo l'origine, senza il percorso del repository);
   - nessun URI di reindirizzamento.
5. Copia il **Client ID** (`…apps.googleusercontent.com`) e incollalo in **Impostazioni** sul sito, oppure come valore predefinito in `js/config.js` così vale per tutti. Il Client ID non è un segreto: può stare nel codice pubblico.

Al primo accesso Google mostra l'avviso "Google non ha verificato questa app": è normale per un'app in test. Clicca **Continua** e lascia spuntati entrambi i permessi.

## Foglio Google con i dati

Si fa una volta sola, dopo la configurazione di Google Cloud qui sopra (servono **Google Sheets API** abilitata e l'ambito `.../auth/spreadsheets`). Il foglio non va creato a mano: lo crea il sito con le schede e le intestazioni giuste.

1. **Genera l'elenco società** dai CSV, dalla cartella del progetto:
   ```bash
   python scripts/converti_csv.py
   ```
   Crea `data/squadre.json`, che resta sul tuo PC (è escluso da Git).
2. **Avvia il sito** (vedi [Prova in locale](#prova-in-locale)) e apri <http://localhost:8080/impostazioni.html>.
3. Riquadro **Invio**: incolla il **Google OAuth Client ID** e premi **Salva**.
4. Riquadro **Foglio Google con i dati**: premi **Accedi con Google** e scegli l'account nel cui Drive vuoi il foglio. All'avviso "Google non ha verificato questa app" clicca **Continua** e lascia spuntati entrambi i permessi (Gmail e Fogli).
5. Sempre lì, premi **Crea un foglio nuovo**. Nel tuo Drive compare il foglio *"Ogni Passaggio Conta - inviti ai tornei"*, con le schede `Squadre`, `Invii` e `Stati`. Il suo ID viene scritto e salvato nel campo **ID del foglio** e appare il pulsante **Apri il foglio**.
   - Se il foglio esiste già, per esempio l'ha creato un collega: non crearne un altro. Incolla il suo indirizzo nel campo **ID del foglio** e premi **Salva**.
6. Riquadro **Elenco società**: premi **Carica squadre.json nel foglio** e scegli `data/squadre.json`. Al termine compare "… squadre caricate nel foglio". Con **Apri il foglio** controlli la scheda `Squadre`.
7. **Condividi il foglio** con il team: **Apri il foglio**, poi **Condividi**, aggiungi le email con ruolo **Editor**. Ogni persona va aggiunta anche agli **Utenti di test** su Google Cloud, altrimenti non riesce ad accedere.
   - In **Accesso generale** lascia **Con restrizioni**, mai **Chiunque abbia il link**: l'ID del foglio sta nel codice pubblico del sito (passo 8), quindi l'unica protezione dei dati è che il foglio sia condiviso solo con le persone del team.
   - **Proteggi la scheda `Squadre`**: clic destro sulla scheda → **Proteggi scheda** → **Imposta autorizzazioni** → **Solo tu**, oppure **Personalizzato** e scegli gli amministratori che devono poter ricaricare l'elenco. Il team continua a scrivere su `Invii` e `Stati`, ma l'elenco società lo modifica solo chi è abilitato.
8. **Rendi il foglio predefinito per tutti**: copia l'ID del foglio in `js/config.js` (`idFoglio`), insieme al Client ID (`googleClientId`). Così chi apre il sito non deve configurare nulla. Nessuno dei due è un segreto: senza condivisione e utenza di test non danno accesso a niente. In `amministratori` vanno le impronte SHA-256 delle email di chi può aprire Impostazioni (il comando è nel commento), così gli indirizzi non compaiono in chiaro nel sito pubblico (chi conosce già un indirizzo può comunque verificarlo).
9. **Verifica**: apri la pagina **Invio** o **Dashboard**. Sotto l'account deve comparire, per esempio, "2.555 squadre in N regioni · 0 invii nello storico · apri il foglio".

Problemi frequenti:
- "Manca l'ID del foglio Google": il passo 5 o il **Salva** del passo 5 non è stato fatto in questo browser.
- Errore di permesso (403/404): l'account con cui hai fatto l'accesso non ha la condivisione del foglio, oppure l'ID è sbagliato.
- Avviso "La scheda Squadre è vuota": manca il passo 6.

Per aggiornare l'elenco in seguito puoi:
- rigenerare `squadre.json` e ricaricarlo: sostituisce solo la scheda `Squadre`, storico e stati restano (la sostituzione è tutta o niente: se fallisce, la scheda resta com'era);
- oppure modificare le righe direttamente nel foglio.

Per aggiungere un CSV nuovo, inseriscilo in `FILE_CSV` dentro lo script. Se non ha la colonna Regione, aggiungilo anche in `FILE_SENZA_REGIONE`.

## Chi vede le Impostazioni

La pagina **Impostazioni** è riservata agli **amministratori**, cioè agli account Google elencati in `amministratori` dentro `js/config.js`.

- **Chi la vede**: chi ha fatto l'accesso con un account della lista. Solo per loro compare la voce **Impostazioni** nel menu; agli altri la voce resta nascosta e, se aprono direttamente `impostazioni.html`, vedono "Riservato agli amministratori". Prima dell'accesso la pagina non la vede nessuno.
- **Eccezioni**: se `amministratori` è vuoto, la pagina è aperta a tutti; se il sito non ha ancora un Client ID (prima configurazione), la pagina resta aperta, perché senza Client ID non si può accedere.
- **Come aggiungere un amministratore**: calcola l'impronta SHA-256 della sua email scritta in minuscolo e aggiungila alla lista, poi pubblica la modifica (commit e push: GitHub Pages si aggiorna in un paio di minuti).
  ```bash
  python -c "import hashlib;print(hashlib.sha256(b'nome@gmail.com').hexdigest())"
  ```
  L'email non compare in chiaro nel sito pubblico, ma chi già la conosce può verificare se è nella lista: è uno pseudonimo, non un segreto.
- **Come toglierlo**: elimina la sua impronta dalla lista e pubblica.
- **Cosa cambia chi la usa**: i valori salvati da Impostazioni (Client ID, ID del foglio, mittente, limiti…) restano **solo nel browser di chi li salva**. Per cambiarli per tutti si modifica `js/config.js`, ma chi ha già premuto **Salva** in Impostazioni continua a usare i propri valori: per tornare a quelli di `config.js` svuota il campo e salva (i numeri vanno reinseriti a mano). La lista degli amministratori si cambia solo lì, mai dalla pagina.

La lista è un filtro dell'interfaccia, non una protezione dei dati: chi legge il codice può aggirarla. I dati restano protetti dal foglio Google: lo vede solo chi ha la condivisione (vedi passo 7), e la scheda `Squadre` si può modificare solo da chi è abilitato nella sua protezione (passo 7). Per questo il caricamento dell'elenco società funziona solo con un account abilitato sulla scheda, anche se un altro utente riuscisse ad aprire la pagina.

## Prova in locale

Il sito va aperto tramite un server (l'accesso Google non funziona con `file://`):

```bash
python scripts/server.py
```

poi apri <http://localhost:8080>. Il server dice al browser di non tenere i file in cache, così le modifiche si vedono subito. Con `python -m http.server 8080 --bind 127.0.0.1` funziona lo stesso, ma serve Ctrl+F5 dopo ogni modifica.

Con la **Modalità test** attiva (predefinita) le mail vanno solo all'indirizzo di test (se non impostato, all'account Google con cui hai fatto l'accesso), mai alle società né in CC, con l'oggetto preceduto da `[TEST]`, al massimo 3 per volta, e non contano come contatti nella dashboard. Senza selezionare nessuna società si prova con una "Società di esempio". Gli invii di test si cancellano eliminando le righe dalla scheda `Invii`.

La regola della modalità test, il controllo degli indirizzi e la sostituzione dell'elenco società hanno test automatici (serve solo Node.js):

```bash
node --test "test/*.test.mjs"
```

## Pubblicazione su GitHub Pages

1. Crea un repository e carica il sito. Il `.gitignore` esclude CSV, `data/` e PDF: **controlla che non finiscano nel repository**, perché lì sarebbero pubblici.
2. **Settings → Pages → Deploy from a branch**, branch `main`, cartella `/ (root)`.
3. Aggiungi `https://<utente>.github.io` alle origini autorizzate del Client ID (punto 4 sopra).
