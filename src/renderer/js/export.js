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
