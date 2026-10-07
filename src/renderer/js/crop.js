// Crop & rotate dialog. The crop rectangle is stored as fractions (0..1) of the
// image *after* rotation, so rotating transforms the rectangle accordingly.

const MIN_CROP = 0.02;

const cropUI = {
  item: null,
  rot: 0,
  crop: null,
  ratio: null,        // pixel aspect (w/h) to lock, or null for free
  ratioKey: 'free',
  imgUrl: null,
  onApply: null,
  drag: null,
};

function cropEls() {
  return {
    modal: document.getElementById('cropModal'),
    stage: document.getElementById('cropStage'),
    wrap: document.getElementById('cropWrap'),
    img: document.getElementById('cropImg'),
    box: document.getElementById('cropBox'),
    info: document.getElementById('cropInfo'),
    ratios: document.getElementById('cropRatios'),
  };
}

function rotatedDims() {
  const src = state.sources.get(cropUI.item.srcId);
  return cropUI.rot % 180 ? { RW: src.height, RH: src.width } : { RW: src.width, RH: src.height };
}

/** fraction-space aspect factor: pixelAspect = (w/h) * k */
function fracK() {
  const { RW, RH } = rotatedDims();
  return RW / RH;
}

function openCrop(item, onApply) {
  cropUI.item = item;
  cropUI.rot = item.rotation;
  cropUI.crop = { ...item.crop };
  cropUI.ratio = null;
  cropUI.ratioKey = 'free';
  cropUI.onApply = onApply;
  const { modal } = cropEls();
  modal.hidden = false;
  updateRatioChips();
  loadCropImage();
}

function closeCrop() {
  const { modal, img } = cropEls();
  modal.hidden = true;
  img.removeAttribute('src');
  if (cropUI.imgUrl) URL.revokeObjectURL(cropUI.imgUrl);
  cropUI.imgUrl = null;
  cropUI.item = null;
}

function loadCropImage() {
  const probe = { srcId: cropUI.item.srcId, rotation: cropUI.rot, crop: { x: 0, y: 0, w: 1, h: 1 } };
  const { w, h } = scaledSize(probe, 1800);
  const canvas = renderItemCanvas(probe, w, h);
  canvas.toBlob((blob) => {
    if (!cropUI.item) return;
    if (cropUI.imgUrl) URL.revokeObjectURL(cropUI.imgUrl);
    cropUI.imgUrl = URL.createObjectURL(blob);
    const { img } = cropEls();
    img.onload = layoutCrop;
    img.src = cropUI.imgUrl;
  }, 'image/jpeg', 0.9);
}

function layoutCrop() {
  if (!cropUI.item) return;
  const { stage, wrap } = cropEls();
  const { RW, RH } = rotatedDims();
  const pad = 32;
  const availW = stage.clientWidth - pad * 2;
  const availH = stage.clientHeight - pad * 2;
  const s = Math.min(availW / RW, availH / RH);
  wrap.style.width = `${Math.floor(RW * s)}px`;
  wrap.style.height = `${Math.floor(RH * s)}px`;
  drawCropBox();
}

function drawCropBox() {
  const { box, info } = cropEls();
  const c = cropUI.crop;
  box.style.left = `${c.x * 100}%`;
  box.style.top = `${c.y * 100}%`;
  box.style.width = `${c.w * 100}%`;
  box.style.height = `${c.h * 100}%`;
  const { RW, RH } = rotatedDims();
  info.innerHTML = `<span>Dimensione ritaglio</span><strong>${Math.round(c.w * RW)} × ${Math.round(c.h * RH)} px</strong>`;
}

function updateRatioChips() {
  cropEls().ratios.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.r === cropUI.ratioKey));
}

/** Largest rectangle with the locked ratio, centred on the current crop. */
function applyRatioToCrop() {
  if (!cropUI.ratio) return;
  const k = fracK();
  let w = 1;
  let h = k / cropUI.ratio;
  if (h > 1) { h = 1; w = cropUI.ratio / k; }
  const c = cropUI.crop;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  cropUI.crop = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

function setRatio(key) {
  cropUI.ratioKey = key;
  if (key === 'free') cropUI.ratio = null;
  else if (key === 'orig') cropUI.ratio = fracK();
  else cropUI.ratio = parseFloat(key);
  applyRatioToCrop();
  updateRatioChips();
  drawCropBox();
}

function rotateCrop(dir) {
  const c = cropUI.crop;
  cropUI.crop = dir > 0
    ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w }
    : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
  cropUI.rot = (cropUI.rot + (dir > 0 ? 90 : 270)) % 360;
  if (cropUI.ratio) {
    cropUI.ratio = 1 / cropUI.ratio;
    const match = [...cropEls().ratios.querySelectorAll('button')]
      .find((b) => b.dataset.r !== 'free' && b.dataset.r !== 'orig' && Math.abs(parseFloat(b.dataset.r) - cropUI.ratio) < 0.01);
    if (cropUI.ratioKey !== 'orig') cropUI.ratioKey = match ? match.dataset.r : 'custom';
    updateRatioChips();
  }
  loadCropImage();
}

// ---------- pointer interaction ----------

function cropPointerDown(e) {
  if (e.button !== 0) return;
  const { wrap } = cropEls();
  const handle = e.target.dataset.h || 'move';
  const rect = wrap.getBoundingClientRect();
  cropUI.drag = { handle, rect, start: { ...cropUI.crop }, px: e.clientX, py: e.clientY };
  e.target.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function cropPointerMove(e) {
  const d = cropUI.drag;
  if (!d) return;
  const s = d.start;
  if (d.handle === 'move') {
    const dx = (e.clientX - d.px) / d.rect.width;
    const dy = (e.clientY - d.py) / d.rect.height;
    cropUI.crop = { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
    drawCropBox();
    return;
  }
  const px = clamp((e.clientX - d.rect.left) / d.rect.width, 0, 1);
  const py = clamp((e.clientY - d.rect.top) / d.rect.height, 0, 1);
  const h = d.handle;
  const dirX = h.includes('e') ? 1 : h.includes('w') ? -1 : 0;
  const dirY = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
  const ax = dirX > 0 ? s.x : dirX < 0 ? s.x + s.w : s.x + s.w / 2;
  const ay = dirY > 0 ? s.y : dirY < 0 ? s.y + s.h : s.y + s.h / 2;

  let w = dirX ? Math.max(MIN_CROP, (px - ax) * dirX) : s.w;
  let hh = dirY ? Math.max(MIN_CROP, (py - ay) * dirY) : s.h;
  const maxW = dirX > 0 ? 1 - ax : dirX < 0 ? ax : 2 * Math.min(ax, 1 - ax);
  const maxH = dirY > 0 ? 1 - ay : dirY < 0 ? ay : 2 * Math.min(ay, 1 - ay);

  if (cropUI.ratio) {
    const k = fracK();
    const r = cropUI.ratio / k; // fraction-space w/h
    if (dirX && dirY) w = Math.max(w, hh * r);
    else if (dirY) w = hh * r;
    hh = w / r;
    const sc = Math.min(1, maxW / w, maxH / hh);
    w *= sc;
    hh *= sc;
  } else {
    w = Math.min(w, maxW);
    hh = Math.min(hh, maxH);
  }

  cropUI.crop = {
    x: dirX > 0 ? ax : dirX < 0 ? ax - w : ax - w / 2,
    y: dirY > 0 ? ay : dirY < 0 ? ay - hh : ay - hh / 2,
    w,
    h: hh,
  };
  drawCropBox();
}

function cropPointerUp() {
  cropUI.drag = null;
}

function initCrop() {
  const { box, ratios } = cropEls();
  box.addEventListener('pointerdown', cropPointerDown);
  box.addEventListener('pointermove', cropPointerMove);
  box.addEventListener('pointerup', cropPointerUp);
  box.addEventListener('pointercancel', cropPointerUp);
  ratios.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setRatio(b.dataset.r);
  });
  document.getElementById('cropRotL').onclick = () => rotateCrop(-1);
  document.getElementById('cropRotR').onclick = () => rotateCrop(1);
  document.getElementById('cropReset').onclick = () => {
    cropUI.rot = 0;
    cropUI.crop = { x: 0, y: 0, w: 1, h: 1 };
    cropUI.ratio = null;
    cropUI.ratioKey = 'free';
    updateRatioChips();
    loadCropImage();
  };
  document.getElementById('cropCancel').onclick = closeCrop;
  document.getElementById('cropClose').onclick = closeCrop;
  document.getElementById('cropApply').onclick = applyCrop;
  window.addEventListener('resize', () => { if (cropUI.item) layoutCrop(); });
}

function applyCrop() {
  if (!cropUI.item) return;
  const { onApply, rot, crop } = cropUI;
  closeCrop();
  onApply(rot, crop);
}

function cropIsOpen() {
  return !!cropUI.item;
}
