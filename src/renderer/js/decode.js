// Turns any supported image file into one or more decoded "sources".
// Chromium decodes JPG/PNG/WEBP/GIF/BMP/AVIF/ICO natively; HEIC goes through
// heic2any, TIFF through UTIF, and SVG is rasterised at high resolution.

const SVG_LONG_SIDE = 3000;
// Long side (px) of the on-screen raster of a PDF page. The export keeps PDF
// pages as vectors whenever possible, so this mostly affects the preview.
const PDF_LONG_SIDE = 2400;

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function baseName(name) {
  return (name || 'immagine').replace(/\.[^.]+$/, '');
}

async function sniff(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 0x2a)) return 'tiff';
  const brand = ascii.slice(4, 12);
  if (/^ftyp(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(brand)) return 'heic';
  if (/^ftypavi[fs]/.test(brand)) return 'avif';
  const ext = extOf(file.name);
  if (ascii.startsWith('%PDF') || ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'svg' || file.type === 'image/svg+xml') return 'svg';
  if (ext === 'heic' || ext === 'heif') return 'heic';
  if (ext === 'tif' || ext === 'tiff') return 'tiff';
  if (ascii.startsWith('\x89PNG')) return 'png';
  if (ascii.startsWith('GIF8')) return 'gif';
  if (ascii.startsWith('BM')) return 'bmp';
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpeg';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
  return ext || 'unknown';
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Formato immagine non riconosciuto'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Impossibile creare l\'immagine'))), type, quality);
  });
}

async function makeSource(blob, name, lossless) {
  const { img, url } = await loadImage(blob);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('Immagine vuota');
  return { id: uid('s'), name, url, img, width: img.naturalWidth, height: img.naturalHeight, lossless };
}

async function decodeHeic(file) {
  if (typeof heic2any !== 'function') throw new Error('Supporto HEIC non disponibile');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95, multiple: true });
  const blobs = Array.isArray(out) ? out : [out];
  const name = baseName(file.name);
  const res = [];
  for (let i = 0; i < blobs.length; i++) {
    res.push(await makeSource(blobs[i], blobs.length > 1 ? `${name} (${i + 1})` : name, false));
  }
  return res;
}

async function decodeTiff(file) {
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf).filter((ifd) => ifd.t256 && ifd.t257);
  if (!ifds.length) throw new Error('TIFF non valido');
  const name = baseName(file.name);
  const res = [];
  for (let i = 0; i < ifds.length; i++) {
    const ifd = ifds[i];
    UTIF.decodeImage(buf, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const canvas = document.createElement('canvas');
    canvas.width = ifd.width;
    canvas.height = ifd.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, 0, ifd.width * ifd.height * 4), ifd.width, ifd.height), 0, 0);
    const blob = await canvasToBlob(canvas);
    res.push(await makeSource(blob, ifds.length > 1 ? `${name} (pag. ${i + 1})` : name, true));
  }
  return res;
}

async function decodeSvg(file) {
  const text = await file.text();
  const { img, url } = await loadImage(new Blob([text], { type: 'image/svg+xml' }));
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if ((!w || !h) && vb) { w = parseFloat(vb[1]); h = parseFloat(vb[2]); }
  if (!w || !h) { w = 1000; h = 1000; }
  const scale = SVG_LONG_SIDE / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob = await canvasToBlob(canvas);
  return [await makeSource(blob, baseName(file.name), true)];
}

// ---------- PDF (pdf.js, loaded on first use) ----------

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const base = new URL('../../node_modules/pdfjs-dist/', document.baseURI).href;
      const [lib, worker] = await Promise.all([
        import(`${base}legacy/build/pdf.min.mjs`),
        import(`${base}legacy/build/pdf.worker.min.mjs`),
      ]);
      // Run pdf.js on the main thread: file:// pages cannot always spawn module workers.
      globalThis.pdfjsWorker = worker;
      lib.GlobalWorkerOptions.workerSrc = `${base}legacy/build/pdf.worker.min.mjs`;
      return { lib, base };
    })().catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

// Annotation types that only draw links/popups; anything else (form fields,
// stamps, ink, notes...) is visible content that vector embedding would drop.
const HARMLESS_ANNOTATIONS = new Set(['Link', 'Popup']);

async function decodePdf(file, onProgress) {
  const { lib, base } = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let doc;
  const task = lib.getDocument({
    data: bytes.slice(), // pdf.js takes ownership of the buffer it is given
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
    enableXfa: false,
  });
  try {
    doc = await task.promise;
  } catch (err) {
    task.destroy();
    if (err && err.name === 'PasswordException') throw new Error('PDF protetto da password');
    throw err;
  }

  const name = baseName(file.name);
  const res = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress?.(`${file.name}: pagina ${i} di ${doc.numPages}`);
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(6, PDF_LONG_SIDE / Math.max(vp1.width, vp1.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
      const annotations = await page.getAnnotations();
      const vector = !annotations.some((a) => !HARMLESS_ANNOTATIONS.has(a.subtype));
      page.cleanup();
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const src = await makeSource(blob, doc.numPages > 1 ? `${name} (pag. ${i})` : name, false);
      src.pdf = { bytes, pageIndex: i - 1, vector };
      res.push(src);
      canvas.width = canvas.height = 0;
    }
  } finally {
    task.destroy();
  }
  if (!res.length) throw new Error('PDF senza pagine');
  return res;
}

/** Returns an array of sources (several for multi-page PDF / TIFF / HEIC). */
async function decodeFile(file, onProgress) {
  const kind = await sniff(file);
  switch (kind) {
    case 'pdf': return decodePdf(file, onProgress);
    case 'heic': return decodeHeic(file);
    case 'tiff': return decodeTiff(file);
    case 'svg': return decodeSvg(file);
    default: {
      const lossless = ['png', 'gif', 'bmp', 'ico'].includes(kind);
      return [await makeSource(file, baseName(file.name), lossless)];
    }
  }
}
