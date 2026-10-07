# Immagini in PDF

App desktop per Windows che trasforma le tue immagini in un PDF: ogni immagine diventa una pagina, nell'ordine in cui la aggiungi. Puoi anche impaginare più immagini sullo stesso foglio, dove preferisci.

## Installazione (Windows)

1. Vai su **[Releases](../../releases/latest)** e scarica `Immagini-in-PDF-Setup-x.y.z.exe`.
2. Fai doppio clic sul file: l'app si installa da sola, senza permessi di amministratore, e si apre. L'icona compare sul desktop e nel menu Start.

### Se Windows blocca l'installazione

L'app non contiene nulla di pericoloso, ma è nuova e non firmata. Per questo Windows Defender SmartScreen non la "conosce" ancora.

- **Schermata blu "Windows ha protetto il PC"**: clicca **Ulteriori informazioni → Esegui comunque**.
- **Il browser blocca il download** (Edge/Chrome): apri i download, clicca i tre puntini accanto al file e scegli **Mantieni / Conserva comunque**.
- **"Controllo intelligente delle app" (Smart App Control) attivo su Windows 11**: in questo caso non c'è un pulsante per proseguire. Usa la versione dal Microsoft Store (vedi sotto), che è firmata da Microsoft.

La soluzione definitiva è il Microsoft Store: Microsoft verifica l'app, la firma con il proprio certificato, e da lì si installa con un clic, senza alcun avviso.

## Integrazione con Esplora file

- **Tasto destro su un'immagine → "Crea PDF con Immagini in PDF"**. Su Windows 11 la voce è in "Mostra altre opzioni".
- **Apri con → Immagini in PDF**. Il visualizzatore di immagini predefinito non viene cambiato.
- **Invia a → Immagini in PDF**: il modo migliore per selezionare tante immagini e mandarle tutte insieme.

Le immagini aperte da Esplora file vengono aggiunte in ordine di nome, una per pagina.

## Pubblicare sul Microsoft Store (gratis)

1. Registrati gratuitamente su [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com) con il tuo account Microsoft. Serve una verifica con documento d'identità e selfie.
2. In Partner Center crea una nuova app e prenota il nome **Immagini in PDF**.
3. Apri **Gestione prodotto → Identità del prodotto** e copia questi tre valori:
   - `Package/Identity/Name`
   - `Package/Identity/Publisher` (inizia con `CN=`)
   - `Package/Properties/PublisherDisplayName`
4. Su GitHub apri **Settings → Secrets and variables → Actions → Variables** e crea:
   `STORE_IDENTITY_NAME`, `STORE_PUBLISHER`, `STORE_PUBLISHER_DISPLAY_NAME` con quei valori.
5. Avvia di nuovo la build (**Actions → Build Windows app → Run workflow**) e scarica `Immagini-in-PDF-Store-x.y.z.appx` dalla release.
6. In Partner Center carica il file `.appx` nella sezione **Pacchetti** e compila la scheda dello Store. Per l'informativa sulla privacy puoi usare il link a [PRIVACY.md](PRIVACY.md).

## Firma digitale (facoltativa)

Se in futuro avrai un certificato di firma del codice, aggiungilo ai secrets del repository:

- `WIN_CSC_LINK`: il file `.pfx` codificato in base64
- `WIN_CSC_KEY_PASSWORD`: la sua password

Da quel momento ogni build verrà firmata automaticamente.

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
npm run dist:win   # crea installer + pacchetto Store in dist/ (su Windows)
```

A ogni push, GitHub Actions compila automaticamente l'installer Windows e lo pubblica nelle Releases.
