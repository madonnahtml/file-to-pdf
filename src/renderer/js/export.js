// Builds the final PDF with pdf-lib.

const MM_TO_PT = 72 / 25.4;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function encodeItem(pdf, item, page, q) {
  const src = state.sources.get(item.srcId);
  const px = itemPixelSize(item);
  // Target resolution from the printed size, never upscaling the original.
  const inches = item.w / 25.4;
  const targetW = Number.isFinite(q.dpi) ? Math.min(px.w, inches * q.dpi) : px.w;
  const scale = targetW / px.w;
  const outW = Math.max(1, Math.round(px.w * scale));
  const outH = Math.max(1, Math.round(px.h * scale));

  const lossless = q.lossless && src.lossless;
  // JPEG has no transparency: flatten onto the page colour.
  const canvas = renderItemCanvas(item, outW, outH, lossless ? null : state.settings.bg);
  const blob = await canvasToBlob(canvas, lossless ? 'image/png' : 'image/jpeg', q.jpeg);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return lossless ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

/** Rotates a crop rectangle (fractions) 90° counter-clockwise. */
function rotateRectCCW(c) {
  return { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
}

/**
 * Draws a page that came from a PDF as vector content (sharp text, small
 * files), honouring the item's crop and rotation. Throws if the source PDF
 * cannot be embedded; the caller then falls back to the raster preview.
 */
async function drawPdfItem(pdf, pdfPage, item, pageH, cache) {
  const src = state.sources.get(item.srcId);
  let srcDoc = cache.get(src.pdf.bytes);
  if (!srcDoc) {
    srcDoc = await PDFLib.PDFDocument.load(src.pdf.bytes, { ignoreEncryption: true, updateMetadata: false });
    cache.set(src.pdf.bytes, srcDoc);
  }
  const sp = srcDoc.getPage(src.pdf.pageIndex);
  const box = sp.getCropBox();
  const pageRot = (((sp.getRotation().angle || 0) % 360) + 360) % 360;
  // Total clockwise rotation from the unrotated page to what the user sees.
  const total = (pageRot + item.rotation) % 360;

  // Crop is expressed on the rotated image: undo the rotation to get it on the raw page.
  let c = { ...item.crop };
  for (let r = 0; r < total; r += 90) c = rotateRectCCW(c);
  const left = box.x + c.x * box.width;
  const top = box.y + box.height - c.y * box.height;
  const embedded = await pdf.embedPage(sp, {
    left,
    right: left + c.w * box.width,
    top,
    bottom: top - c.h * box.height,
  });

  const h = itemHeight(item);
  const X = item.x * MM_TO_PT;
  const Y = pageH - (item.y + h) * MM_TO_PT;
  const W = item.w * MM_TO_PT;
  const H = h * MM_TO_PT;
  // PDF pages have no background of their own: match the white preview.
  pdfPage.drawRectangle({ x: X, y: Y, width: W, height: H, color: PDFLib.rgb(1, 1, 1) });
  // pdf-lib rotates counter-clockwise around (x, y).
  const place = {
    0: { x: X, y: Y, width: W, height: H, rotate: 0 },
    90: { x: X, y: Y + H, width: H, height: W, rotate: -90 },
    180: { x: X + W, y: Y + H, width: W, height: H, rotate: 180 },
    270: { x: X + W, y: Y, width: H, height: W, rotate: 90 },
  }[total];
  pdfPage.drawPage(embedded, { ...place, rotate: PDFLib.degrees(place.rotate) });
}

async function buildPdf(onProgress) {
  const { PDFDocument } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle('Immagini in PDF');
  pdf.setCreator('Immagini in PDF');
  pdf.setProducer('Immagini in PDF');

  const q = QUALITY[state.settings.quality] || QUALITY.high;
  const bg = state.settings.bg.toLowerCase();
  const totalItems = state.pages.reduce((s, p) => s + p.items.length, 0) || 1;
  let done = 0;
  const pdfCache = new Map();

  for (let pi = 0; pi < state.pages.length; pi++) {
    const page = state.pages[pi];
    applyLayout(page);
    const dims = pageDims(page);
    const W = dims.w * MM_TO_PT;
    const H = dims.h * MM_TO_PT;
    const pdfPage = pdf.addPage([W, H]);
    if (bg !== '#ffffff') {
      pdfPage.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hexToRgb(bg) });
    }
    for (const item of page.items) {
      onProgress(pi, done / totalItems);
      await nextFrame();
      const src = state.sources.get(item.srcId);
      if (src && src.pdf && src.pdf.vector) {
        try {
          await drawPdfItem(pdf, pdfPage, item, H, pdfCache);
          done += 1;
          continue;
        } catch (err) {
          console.warn('PDF vettoriale non incorporabile, uso l\'immagine', err);
        }
      }
      const img = await encodeItem(pdf, item, page, q);
      const h = itemHeight(item);
      pdfPage.drawImage(img, {
        x: item.x * MM_TO_PT,
        y: H - (item.y + h) * MM_TO_PT,
        width: item.w * MM_TO_PT,
        height: h * MM_TO_PT,
      });
      done += 1;
    }
  }
  onProgress(state.pages.length - 1, 1);
  return pdf.save();
}
