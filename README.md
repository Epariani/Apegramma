# 🐝 Apegramma · Tabellone

Tabellone da proiettare per giocare ad **Apegramma a squadre** durante una cena.
Al centro ci sono le lettere (l'alveare) con la barra per controllare le parole; tutto intorno i **Tavoli** con punteggio totale e punteggio della manche.

È un sito statico (HTML + CSS + JavaScript, nessuna dipendenza): funziona su GitHub Pages, ma anche aprendo `index.html` direttamente dal computer, senza internet (in quel caso usa i font di sistema).

## Come si gioca

1. A inizio manche il conduttore mostra le lettere (🎲 casuali o 📋 da un set preparato). Si possono tenere nascoste e rivelarle al via (🙈 / tasto **R**).
2. Parte l'**asta**: i tavoli rilanciano dicendo quante lettere avrà la loro parola. Il conduttore segna le offerte con **+ / −** nel box del tavolo: il tavolo in testa si illumina e compare il banner «offre N lettere».
3. Il tavolo che vince l'asta dice la parola: si scrive nella barra e si preme **Verifica**. Il tabellone controlla:
   - che usi solo le lettere dell'alveare (si possono ripetere);
   - che contenga la lettera centrale;
   - che sia lunga almeno 4 lettere (modificabile);
   - che non sia già stata usata;
   - che non sia più corta dell'offerta (avviso o blocco, a scelta).

   Se usa tutte le lettere è un **apegramma** 🐝 e prende il bonus.
4. Se è valida: **✔ Assegna** (o di nuovo **Invio**) somma i punti alla manche del tavolo scelto. Se non è valida: **✖ Bocciata** (con penalità opzionale), oppure **Accetta comunque** se il conduttore decide di farla passare. I link a Wikizionario e Google aiutano a dirimere le contestazioni sul significato.
5. **🏁 Fine manche** somma i punti della manche ai totali, salva la manche nello storico, azzera le offerte e passa alla successiva.

### Punteggio

La parola vincente vale **tanti punti quante sono le sue lettere**; se è un **apegramma** (usa tutte le lettere dell'alveare) vale **il doppio**. Esempio con l'alveare N·O·D·S·I·T·A: ADOTTANDO = 9 punti, SONDATI (apegramma) = 7 × 2 = 14 punti.
Dalle Impostazioni si può passare a un punteggio fisso o a un bonus fisso per l'apegramma.

### Manche «al chiuso» 🔒

A fine manche il tabellone estrae a caso il tipo della manche successiva (probabilità regolabile, default 25%). Se esce **al chiuso** compare un annuncio a tutto schermo:

1. ogni tavolo scrive la propria parola su un foglio;
2. il conduttore sceglie il tavolo (menu a tendina, clic sul box o tasti `1`…`9`) e scrive la parola: nella barra appaiono solo pallini, così il pubblico non la legge; dopo **Invio** si passa da solo al tavolo successivo. I box mostrano 📝 *consegnata* / ⏳ *foglio*;
3. **🔓 Rivela le parole** mostra la classifica della manche: vince la **parola valida più lunga**. In caso di pareggio vincono tutti i tavoli a pari merito, **a meno che uno abbia un apegramma**: allora vince l'apegramma (in Impostazioni si può far vincere l'apegramma sempre, anche contro parole più lunghe);
4. il conduttore può ribaltare un giudizio (**✖ Boccia** / **✔ Accetta**, ad esempio per una parola che non esiste) e il vincitore si ricalcola;
5. **🏁 Fine manche**: tutte le parole rivelate entrano tra le parole usate.

La manche al chiuso si può anche attivare o disattivare a mano con 🔒 o il tasto `K` (con probabilità 0% si gioca solo così).

> Il tabellone controlla le **regole** (lettere, centrale, lunghezza, ripetizioni), non se la parola esiste in italiano: quello lo decide il conduttore.

## Funzioni pratiche

| Funzione | Dove |
|---|---|
| Da 2 a 20 tavoli, disposti in senso orario intorno al tabellone | ⚙️ Impostazioni |
| Nomi e colori dei tavoli modificabili | ⚙️ Impostazioni, oppure doppio clic sul box |
| Correzione manuale di totale, punti manche e offerta | doppio clic sul box / ✏️ |
| Punteggio: 1 punto per lettera (default) o fisso; apegramma doppio, con bonus o senza extra | ⚙️ Impostazioni |
| Manche al chiuso: probabilità di estrazione e regola dell'apegramma | ⚙️ Impostazioni |
| Penalità per parola sbagliata (anche nelle manche al chiuso) | ⚙️ Impostazioni |
| Numero di lettere (5–10), lunghezza minima, centrale obbligatoria sì/no | ⚙️ Impostazioni |
| Parole usate valide per tutta la partita o solo per la manche | ⚙️ Impostazioni |
| Set di lettere preparati in anticipo (es. `nodsita:n`) | ⚙️ Impostazioni → 📋 Set successivo |
| Lettere scritte a mano per la manche in corso | ⚙️ Impostazioni |
| Timer dell'asta con suono negli ultimi 5 secondi | clic sul timer / Spazio |
| Obiettivo punti o numero di manche → classifica finale automatica | ⚙️ Impostazioni |
| **Annulla** illimitato (ultime 60 azioni) | ↩️ / Ctrl+Z |
| Storico manche con lettere, vincitori e parole | 🗂️ Storico |
| Modalità presentazione: nasconde tutti i comandi | 🎬 / tasto H |
| Dimensione del testo regolabile per sale grandi | ⚙️ Impostazioni |
| Salvataggio automatico nel browser (un refresh non perde nulla) | automatico |
| Salva/carica la partita in `.json`, esporta i risultati in `.csv` (Excel) | ⚙️ Impostazioni → Dati |

### Scorciatoie da tastiera

| Tasto | Azione |
|---|---|
| `Invio` o `/` | vai alla barra parola · `Invio` nella barra: verifica, poi assegna |
| `Esc` | chiude l'esito e deseleziona il tavolo |
| `1`…`9`, `0` | seleziona il tavolo 1…10 (al chiuso: il tavolo di cui stai scrivendo il foglio) |
| `+` / `−` | alza / abbassa l'offerta del tavolo selezionato |
| `Spazio` | avvia / mette in pausa il timer (doppio clic sul timer: azzera) |
| `N` | nuove lettere casuali |
| `P` | prossimo set preparato |
| `M` | mescola le lettere esterne |
| `K` | attiva / disattiva la manche al chiuso |
| `R` | nascondi / rivela le lettere |
| `C` | classifica |
| `H` | modalità presentazione |
| `F` | schermo intero |
| `Ctrl+Z` | annulla |

## Pubblicare su GitHub Pages

1. Crea un nuovo repository su GitHub (es. `apegramma-tabellone`).
2. Carica il **contenuto** di questa cartella (non la cartella stessa) nella radice del repository: *Add file → Upload files*, oppure da terminale:
   ```bash
   cd apegramma-tabellone
   git init
   git add .
   git commit -m "Tabellone Apegramma"
   git branch -M main
   git remote add origin https://github.com/<utente>/apegramma-tabellone.git
   git push -u origin main
   ```
3. Nel repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, cartella `/ (root)`, **Save**.
4. Dopo un minuto il sito è online su `https://<utente>.github.io/apegramma-tabellone/`.

## Consigli per la serata

- Prova il proiettore prima: con **Impostazioni → Dimensione testo** si adatta a schermi piccoli o sale grandi.
- Prepara i set di lettere in anticipo (per esempio prendendoli dagli Apegramma pubblicati), così sai che c'è un apegramma in ogni manche.
- Gestisci il gioco da un portatile collegato al proiettore in modalità **duplica schermo**, con la modalità presentazione attiva (tasto **H**): le scorciatoie da tastiera funzionano anche con i comandi nascosti.
- I dati restano nel browser usato: per spostare la partita su un altro computer usa *Salva partita (.json)* e *Carica partita*.

## Struttura

```
apegramma-tabellone/
├── index.html      pagina del tabellone e finestre di dialogo
├── css/style.css   grafica (tema scuro ad alto contrasto per il proiettore)
├── js/app.js       logica di gioco, salvataggio, scorciatoie
├── favicon.svg
├── .nojekyll       dice a GitHub Pages di servire i file così come sono
└── README.md
```
