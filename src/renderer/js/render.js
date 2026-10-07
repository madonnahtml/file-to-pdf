// Rendering of an item (source + rotation + crop) to a canvas, and a cache of
// on-screen previews for cropped / rotated items.

const PREVIEW_LONG_SIDE = 1400;
const previewCache = new Map(); // key -> { url, pending }
let onPreviewReady = () => {};

function cropKey(item) {
  const c = item.crop;
  return `${item.srcId}|${item.rotation}|${c.x.toFixed(4)},${c.y.toFixed(4)},${c.w.toFixed(4)},${c.h.toFixed(4)}`;
}

function isUntouched(item) {
  const c = item.crop;
  return item.rotation === 0 && c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1;
}

/**
 * Draws the item's visible region into a new canvas of outW × outH pixels.
 * `bg` (optional) fills the canvas first, e.g. for JPEG export.
 */
function renderItemCanvas(item, outW, outH, bg) {
  const src = state.sources.get(item.srcId);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (!src) return canvas;

  const W = src.width;
  const H = src.height;
  const rot = ((item.rotation % 360) + 360) % 360;
  const RW = rot % 180 ? H : W;
  const RH = rot % 180 ? W : H;
  const c = item.crop;
  const cx = c.x * RW, cy = c.y * RH, cw = c.w * RW, ch = c.h * RH;

  // Map the crop rectangle (in rotated space) onto the output canvas,
  // then rotate the source into that space.
  ctx.scale(canvas.width / cw, canvas.height / ch);
  ctx.translate(-cx, -cy);
  if (rot === 90) { ctx.translate(RW, 0); ctx.rotate(Math.PI / 2); }
  else if (rot === 180) { ctx.translate(RW, RH); ctx.rotate(Math.PI); }
  else if (rot === 270) { ctx.translate(0, RH); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(src.img, 0, 0, W, H);
  return canvas;
}

/** Scaled output size for an item so its long side is at most `longSide` px. */
function scaledSize(item, longSide) {
  const { w, h } = itemPixelSize(item);
  const s = Math.min(1, longSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** URL to display for an item, or null while a preview is being generated. */
function previewUrl(item) {
  const src = state.sources.get(item.srcId);
  if (!src) return null;
  if (isUntouched(item)) return src.url;
  const key = cropKey(item);
  const hit = previewCache.get(key);
  if (hit) return hit.url;
  previewCache.set(key, { url: null });
  // Generate off the current frame so dragging stays smooth.
  setTimeout(() => {
    const { w, h } = scaledSize(item, PREVIEW_LONG_SIDE);
    const canvas = renderItemCanvas(item, w, h);
    canvas.toBlob((blob) => {
      previewCache.set(key, { url: blob ? URL.createObjectURL(blob) : src.url });
      onPreviewReady();
    }, src.lossless ? 'image/png' : 'image/jpeg', 0.9);
  }, 0);
  return null;
}
