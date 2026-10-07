# Immagini in PDF

App desktop per Windows che trasforma le tue immagini in un PDF: ogni immagine diventa una pagina, nell'ordine in cui la aggiungi. Puoi anche impaginare più immagini sullo stesso foglio, dove preferisci.

## Installazione (Windows)

1. Vai su **[Releases](../../releases/latest)** e scarica `Immagini-in-PDF-Setup-x.y.z.exe`.
2. Fai doppio clic sul file. Se Windows mostra "Windows ha protetto il PC", clicca **Ulteriori informazioni → Esegui comunque**: l'app non è firmata digitalmente.
3. Al termine trovi l'icona **Immagini in PDF** sul desktop e nel menu Start.

Preferisci non installare nulla? Scarica `Immagini-in-PDF-Portable-x.y.z.exe` e avvialo direttamente.

## Funzioni

- **Formati:** JPG, PNG, HEIC/HEIF (foto iPhone), WEBP, GIF, BMP, TIFF (anche multipagina), SVG, AVIF.
- **Aggiunta:** con il pulsante o trascinando i file nella finestra. Se li rilasci su una pagina, finiscono in quella pagina.
- **Pagine:** riordino con drag & drop, duplicazione, eliminazione, pagine vuote, unione con la pagina precedente.
- **Editor della pagina:** anteprima reale del foglio. Sposti le immagini trascinandole e le ridimensioni dagli angoli, con guide magnetiche (tieni premuto Alt per disattivarle).
- **Disposizioni automatiche:** griglia, colonna, riga oppure posizione libera.
- **Ritaglio:** proporzioni libere, originali, 1:1, 4:3, 16:9, A4 e altre. Rotazione di 90°.
- **Formato pagina:** A4, A3, A5, Letter, Legal oppure "adatta all'immagine".
- **Orientamento:** automatico, verticale oppure orizzontale.
- **Margini, spaziatura e colore di sfondo** regolabili.
- **Compressione:** Massima, Alta (300 DPI), Media (200 DPI), Leggera (120 DPI, adatta all'email).
- **Tema:** chiaro, scuro oppure automatico.
- **Annulla/ripeti** illimitati.

### Scorciatoie da tastiera

| Tasto | Azione |
|---|---|
| Ctrl+O | Aggiungi immagini |
| Ctrl+S | Crea PDF |
| Ctrl+Z / Ctrl+Y | Annulla / Ripeti |
| R / Shift+R | Ruota a destra / sinistra |
| C (o doppio clic) | Ritaglia |
| Frecce (Shift = 10 mm) | Sposta l'immagine selezionata |
| Canc | Elimina l'immagine (o la pagina se non c'è selezione) |
| Pag↑ / Pag↓ | Pagina precedente / successiva |

## Sviluppo

```bash
npm install
npm start          # avvia l'app
npm run dist:win   # crea installer + portable in dist/ (su Windows)
```

A ogni push, GitHub Actions compila automaticamente l'installer Windows e lo pubblica nelle Releases.
