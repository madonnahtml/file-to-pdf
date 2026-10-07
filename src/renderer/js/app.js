// UI wiring: page list, page editor, inspector, import and export.

const $ = (id) => document.getElementById(id);

const ui = {
  zoom: 1,
  scale: 1,          // px per mm in the editor
  drag: null,        // item drag/resize in progress
  itemEls: new Map(),
  renderQueued: false,
  busy: false,
  dragPageId: null,
};

// ---------- rendering ----------

function scheduleRender() {
  if (ui.renderQueued) return;
  ui.renderQueued = true;
  requestAnimationFrame(() => {
    ui.renderQueued = false;
    render();
  });
}
onPreviewReady = scheduleRender;

function render() {
  if (!currentPage() && state.pages.length) state.currentPageId = state.pages[0].id;
  if (!selectedItem()) state.selectedItemId = null;
  state.pages.forEach(applyLayout);

  const hasPages = state.pages.length > 0;
  document.body.classList.toggle('is-empty', !hasPages);
  const nImages = state.pages.reduce((s, p) => s + p.items.length, 0);
  $('docSummary').textContent = hasPages
    ? `${nImages} ${nImages === 1 ? 'immagine' : 'immagini'} · ${state.pages.length} ${state.pages.length === 1 ? 'pagina' : 'pagine'}`
    : 'Nessuna immagine';
  $('pageCount').textContent = state.pages.length;
  $('btnUndo').disabled = !hist.undo.length;
  $('btnRedo').disabled = !hist.redo.length;
  $('btnExport').disabled = !nImages;
  $('btnClear').disabled = !hasPages;

  renderPageList();
  renderEditor();
  renderInspector();
}

function thumbHtml(page) {
  const d = pageDims(page);
  const imgs = page.items.map((it) => {
    const url = previewUrl(it);
    const h = itemHeight(it);
    const style = `left:${(it.x / d.w) * 100}%;top:${(it.y / d.h) * 100}%;width:${(it.w / d.w) * 100}%;height:${(h / d.h) * 100}%`;
    return url ? `<img src="${url}" style="${style}" draggable="false" alt="">` : `<span class="shimmer" style="${style}"></span>`;
  }).join('');
  return `<div class="thumb-page" style="aspect-ratio:${d.w}/${d.h};background:${state.settings.bg}">${imgs || '<span class="thumb-empty">vuota</span>'}</div>`;
}

function renderPageList() {
  const list = $('pageList');
  const frag = document.createDocumentFragment();
  state.pages.forEach((page, i) => {
    const el = document.createElement('div');
    el.className = 'thumb' + (page.id === state.currentPageId ? ' active' : '');
    el.draggable = true;
    el.dataset.id = page.id;
    el.innerHTML = `
      <div class="thumb-num">${i + 1}</div>
      ${thumbHtml(page)}
      <div class="thumb-actions">
        <button class="mini" data-act="dup" title="Duplica pagina"><i data-icon="copy"></i></button>
        <button class="mini danger" data-act="del" title="Elimina pagina"><i data-icon="trash"></i></button>
      </div>`;
    frag.appendChild(el);
  });
  list.replaceChildren(frag);
  hydrateIcons(list);
  const active = list.querySelector('.thumb.active');
  if (active && ui.scrollToActive) {
    active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ui.scrollToActive = false;
  }
}

function computeScale(page) {
  const scroll = $('canvasScroll');
  const d = pageDims(page);
  const pad = 56;
  const fit = Math.min((scroll.clientWidth - pad * 2) / d.w, (scroll.clientHeight - pad * 2) / d.h);
  return Math.max(0.2, fit * ui.zoom);
}

function renderEditor() {
  const page = currentPage();
  const pageEl = $('pageEl');
  if (!page) {
    ui.itemEls.forEach((el) => el.remove());
    ui.itemEls.clear();
    return;
  }
  const d = pageDims(page);
  ui.scale = computeScale(page);
  const s = ui.scale;
  pageEl.style.width = `${d.w * s}px`;
  pageEl.style.height = `${d.h * s}px`;
  pageEl.style.background = state.settings.bg;
  pageEl.classList.toggle('dark-page', isDarkColor(state.settings.bg));
  pageEl.classList.toggle('is-blank', !page.items.length);
  $('zoomFit').textContent = `${Math.round(ui.zoom * 100)}%`;

  const box = contentBox(page, d);
  const guide = $('marginGuide');
  guide.style.display = box.x > 0.5 ? 'block' : 'none';
  Object.assign(guide.style, { left: `${box.x * s}px`, top: `${box.y * s}px`, width: `${box.w * s}px`, height: `${box.h * s}px` });

  const seen = new Set();
  page.items.forEach((item, idx) => {
    seen.add(item.id);
    let el = ui.itemEls.get(item.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'item';
      el.dataset.id = item.id;
      el.innerHTML = '<img draggable="false" alt=""><div class="item-frame"></div>';
      el.addEventListener('pointerdown', onItemPointerDown);
      el.addEventListener('dblclick', () => itemAction('crop'));
      pageEl.appendChild(el);
      ui.itemEls.set(item.id, el);
    }
    positionItemEl(el, item);
    el.style.zIndex = String(idx + 1);
    el.classList.toggle('selected', item.id === state.selectedItemId);
    const url = previewUrl(item);
    const img = el.firstElementChild;
    if (url && img.getAttribute('src') !== url) img.src = url;
    el.classList.toggle('loading', !url);
  });
  ui.itemEls.forEach((el, id) => {
    if (!seen.has(id)) {
      el.remove();
      ui.itemEls.delete(id);
    }
  });

  const sel = selectedItem();
  const hasSel = !!sel;
  $('selBox').classList.toggle('show', hasSel);
  if (sel) positionItemEl($('selBox'), sel);
  $('tbItem').classList.toggle('show', hasSel);
  $('tbHint').classList.toggle('show', !hasSel);
  const idx = pageIndex(page.id);
  const tb = $('tbItem');
  tb.querySelector('[data-act="prevPage"]').disabled = idx <= 0;
  tb.querySelector('[data-act="ownPage"]').disabled = page.items.length < 2;
}

function positionItemEl(el, item) {
  const s = ui.scale;
  el.style.left = `${item.x * s}px`;
  el.style.top = `${item.y * s}px`;
  el.style.width = `${item.w * s}px`;
  el.style.height = `${itemHeight(item) * s}px`;
}

function renderInspector() {
  const st = state.settings;
  $('setPageSize').value = st.pageSize;
  $('setMargin').value = st.margin;
  $('marginVal').textContent = `${st.margin} mm`;
  $('setGap').value = st.gap;
  $('gapVal').textContent = `${st.gap} mm`;
  $('setBg').value = st.bg;
  document.querySelectorAll('#bgSwatches [data-bg]').forEach((b) => b.classList.toggle('active', b.dataset.bg === st.bg));
  $('setBg').parentElement.classList.toggle('active', !document.querySelector('#bgSwatches [data-bg].active'));
  setSegmented('setQuality', st.quality);
  $('qualityHint').textContent = (QUALITY[st.quality] || QUALITY.high).hint;

  const page = currentPage();
  $('pageCard').classList.toggle('disabled', !page);
  if (!page) return;
  $('pageCardNum').textContent = `${pageIndex(page.id) + 1} di ${state.pages.length}`;
  setSegmented('setOrientation', page.orientation);
  setSegmented('setLayout', page.layout);
  $('setOrientation').classList.toggle('disabled', st.pageSize === 'fit' && page.items.length === 1);
  $('btnMergePrev').disabled = pageIndex(page.id) <= 0;
}

function setSegmented(id, value) {
  $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === value));
}

function isDarkColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

// ---------- page selection ----------

function selectPage(id, { scroll = true } = {}) {
  if (state.currentPageId !== id) state.selectedItemId = null;
  state.currentPageId = id;
  ui.scrollToActive = scroll;
  render();
}

// ---------- item drag / resize / snapping ----------

function onItemPointerDown(e) {
  if (e.button !== 0) return;
  const page = currentPage();
  const handle = e.target.dataset.handle;
  const id = handle ? state.selectedItemId : e.currentTarget.dataset.id;
  const item = page && page.items.find((it) => it.id === id);
  if (!item) return;
  e.stopPropagation();
  if (state.selectedItemId !== item.id) {
    state.selectedItemId = item.id;
    renderEditor();
  }
  const el = e.currentTarget;
  ui.drag = {
    el,
    itemEl: ui.itemEls.get(item.id),
    item,
    page,
    handle: handle || 'move',
    sx: e.clientX,
    sy: e.clientY,
    orig: null,
    moved: false,
  };
  el.setPointerCapture(e.pointerId);
  el.addEventListener('pointermove', onItemPointerMove);
  el.addEventListener('pointerup', onItemPointerUp);
  el.addEventListener('pointercancel', onItemPointerUp);
}

function onItemPointerMove(e) {
  const d = ui.drag;
  if (!d) return;
  if (!d.moved) {
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    pushHistory();
    makeFree(d.page);
    d.moved = true;
    d.orig = { x: d.item.x, y: d.item.y, w: d.item.w, h: itemHeight(d.item) };
    document.body.classList.add('dragging-item');
    renderInspector();
  }
  const s = ui.scale;
  const dx = (e.clientX - d.sx) / s;
  const dy = (e.clientY - d.sy) / s;
  const o = d.orig;
  const it = d.item;

  if (d.handle === 'move') {
    it.x = o.x + dx;
    it.y = o.y + dy;
    if (!e.altKey) snapItem(d.page, it);
    else hideSnap();
    clampItem(d.page, it);
  } else {
    const a = o.w / o.h;
    const sxn = d.handle.includes('e') ? 1 : -1;
    const syn = d.handle.includes('s') ? 1 : -1;
    const w = Math.max(8, o.w + sxn * dx, (o.h + syn * dy) * a);
    const h = w / a;
    it.w = w;
    it.x = sxn > 0 ? o.x : o.x + o.w - w;
    it.y = syn > 0 ? o.y : o.y + o.h - h;
  }
  positionItemEl(d.itemEl, it);
  positionItemEl($('selBox'), it);
}

function onItemPointerUp() {
  const d = ui.drag;
  if (!d) return;
  d.el.removeEventListener('pointermove', onItemPointerMove);
  d.el.removeEventListener('pointerup', onItemPointerUp);
  d.el.removeEventListener('pointercancel', onItemPointerUp);
  ui.drag = null;
  document.body.classList.remove('dragging-item');
  hideSnap();
  render();
}

function snapItem(page, it) {
  const d = pageDims(page);
  const box = contentBox(page, d);
  const h = itemHeight(it);
  const thr = 7 / ui.scale;
  const xs = [0, box.x, d.w / 2, box.x + box.w, d.w];
  const ys = [0, box.y, d.h / 2, box.y + box.h, d.h];
  page.items.forEach((o) => {
    if (o.id === it.id) return;
    const oh = itemHeight(o);
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + oh / 2, o.y + oh);
  });
  const best = (targets, points) => {
    let res = null;
    targets.forEach((t) => points.forEach((p) => {
      const diff = t - p;
      if (Math.abs(diff) < thr && (!res || Math.abs(diff) < Math.abs(res.diff))) res = { diff, t };
    }));
    return res;
  };
  const bx = best(xs, [it.x, it.x + it.w / 2, it.x + it.w]);
  const by = best(ys, [it.y, it.y + h / 2, it.y + h]);
  const sv = $('snapV');
  const sh = $('snapH');
  if (bx) { it.x += bx.diff; sv.style.left = `${bx.t * ui.scale}px`; sv.classList.add('show'); } else sv.classList.remove('show');
  if (by) { it.y += by.diff; sh.style.top = `${by.t * ui.scale}px`; sh.classList.add('show'); } else sh.classList.remove('show');
}

function hideSnap() {
  $('snapV').classList.remove('show');
  $('snapH').classList.remove('show');
}

// ---------- item actions ----------

function rotateItem(item, dir) {
  const c = item.crop;
  item.crop = dir > 0
    ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w }
    : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
  // Keep the centre and visual area in free layouts.
  const h = itemHeight(item);
  const cx = item.x + item.w / 2;
  const cy = item.y + h / 2;
  item.rotation = (item.rotation + (dir > 0 ? 90 : 270)) % 360;
  item.w = h;
  item.x = cx - item.w / 2;
  item.y = cy - itemHeight(item) / 2;
}

function placeNewItemFree(page, item, at) {
  const box = contentBox(page);
  const a = itemAspect(item);
  item.w = Math.min(box.w * 0.5, box.h * 0.5 * a);
  const h = item.w / a;
  const cx = at ? at.x : box.x + box.w / 2;
  const cy = at ? at.y : box.y + box.h / 2;
  item.x = cx - item.w / 2;
  item.y = cy - h / 2;
  clampItem(page, item);
}

function moveItemToPage(item, fromPage, toPage) {
  fromPage.items = fromPage.items.filter((it) => it.id !== item.id);
  toPage.items.push(item);
  if (toPage.layout === 'free') placeNewItemFree(toPage, item);
}

function itemAction(act) {
  const page = currentPage();
  const item = selectedItem();
  if (!page || !item) return;
  const idx = pageIndex(page.id);

  if (act === 'crop') {
    openCrop(item, (rotation, crop) => {
      pushHistory();
      const h = itemHeight(item);
      const area = item.w * h;
      const cx = item.x + item.w / 2;
      const cy = item.y + h / 2;
      item.rotation = rotation;
      item.crop = crop;
      // Keep roughly the same footprint on the page.
      const a = itemAspect(item);
      item.w = Math.sqrt(area * a);
      item.x = cx - item.w / 2;
      item.y = cy - item.w / a / 2;
      if (page.layout === 'free') clampItem(page, item);
      render();
    });
    return;
  }

  pushHistory();
  switch (act) {
    case 'rotL':
    case 'rotR':
      rotateItem(item, act === 'rotR' ? 1 : -1);
      break;
    case 'fit':
      makeFree(page);
      fitItem(page, item);
      break;
    case 'center': {
      makeFree(page);
      const d = pageDims(page);
      item.x = (d.w - item.w) / 2;
      item.y = (d.h - itemHeight(item)) / 2;
      break;
    }
    case 'front':
    case 'back':
      page.items = page.items.filter((it) => it !== item);
      if (act === 'front') page.items.push(item); else page.items.unshift(item);
      break;
    case 'prevPage':
      if (idx > 0) {
        moveItemToPage(item, page, state.pages[idx - 1]);
        state.currentPageId = state.pages[idx - 1].id;
      }
      break;
    case 'nextPage': {
      let target = state.pages[idx + 1];
      if (!target) {
        target = newPage();
        state.pages.push(target);
      }
      moveItemToPage(item, page, target);
      state.currentPageId = target.id;
      break;
    }
    case 'ownPage': {
      const np = newPage();
      state.pages.splice(idx + 1, 0, np);
      moveItemToPage(item, page, np);
      state.currentPageId = np.id;
      break;
    }
    case 'duplicate': {
      const copy = { ...JSON.parse(JSON.stringify(item)), id: uid('i'), x: item.x + 6, y: item.y + 6 };
      page.items.push(copy);
      if (page.layout === 'free') clampItem(page, copy);
      state.selectedItemId = copy.id;
      break;
    }
    case 'delete':
      page.items = page.items.filter((it) => it !== item);
      state.selectedItemId = null;
      break;
    default:
      hist.undo.pop();
      return;
  }
  ui.scrollToActive = true;
  render();
}

// ---------- page actions ----------

function pageAction(act, id) {
  const idx = pageIndex(id);
  if (idx < 0) return;
  pushHistory();
  if (act === 'del') {
    state.pages.splice(idx, 1);
    if (state.currentPageId === id) {
      const next = state.pages[Math.min(idx, state.pages.length - 1)];
      state.currentPageId = next ? next.id : null;
      state.selectedItemId = null;
    }
  } else if (act === 'dup') {
    const copy = JSON.parse(JSON.stringify(state.pages[idx]));
    copy.id = uid('p');
    copy.items.forEach((it) => { it.id = uid('i'); });
    state.pages.splice(idx + 1, 0, copy);
    state.currentPageId = copy.id;
    state.selectedItemId = null;
  }
  render();
}

function movePage(id, toIndex) {
  const from = pageIndex(id);
  if (from < 0) return;
  pushHistory();
  const [p] = state.pages.splice(from, 1);
  state.pages.splice(toIndex > from ? toIndex - 1 : toIndex, 0, p);
  render();
}

// ---------- import ----------

function openFilePicker(target) {
  ui.pickTarget = target || null;
  const input = $('fileInput');
  input.value = '';
  input.click();
}

/**
 * target: null → one new page per image, appended at the end.
 *         { pageId, at? } → added to that page (at = drop point in mm).
 */
async function addFiles(fileList, target) {
  const files = [...fileList].filter((f) => f && f.size !== 0);
  if (!files.length) return;
  const t = toast(`Importazione di ${files.length} ${files.length === 1 ? 'file' : 'file'}…`, { spinner: true, timeout: 0 });
  const failed = [];
  const sources = [];
  for (let i = 0; i < files.length; i++) {
    t.update(`Importazione ${i + 1} di ${files.length}: ${files[i].name}`);
    try {
      const res = await decodeFile(files[i]);
      res.forEach((s) => state.sources.set(s.id, s));
      sources.push(...res);
    } catch (err) {
      console.warn(files[i].name, err);
      failed.push(files[i].name);
    }
  }
  t.close();

  if (sources.length) {
    pushHistory();
    const page = target && state.pages.find((p) => p.id === target.pageId);
    if (page) {
      sources.forEach((s, i) => {
        const item = newItem(s.id);
        page.items.push(item);
        if (page.layout === 'free') {
          const at = target.at ? { x: target.at.x + i * 6, y: target.at.y + i * 6 } : null;
          placeNewItemFree(page, item, at);
        }
      });
      state.currentPageId = page.id;
    } else {
      const first = sources.map((s) => {
        const p = newPage([newItem(s.id)]);
        state.pages.push(p);
        return p;
      })[0];
      state.currentPageId = first.id;
      state.selectedItemId = null;
    }
    ui.scrollToActive = true;
    render();
    toast(`${sources.length} ${sources.length === 1 ? 'immagine aggiunta' : 'immagini aggiunte'}`, { type: 'success' });
  }
  if (failed.length) {
    toast(`Impossibile leggere: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ` e altri ${failed.length - 3}` : ''}`, { type: 'error', timeout: 7000 });
  }
}

// ---------- export ----------

function suggestedName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Immagini ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.pdf`;
}

function formatBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function exportPdf() {
  if (ui.busy) return;
  if (!state.pages.some((p) => p.items.length)) {
    toast('Aggiungi almeno un\'immagine per creare il PDF', { type: 'error' });
    return;
  }
  ui.busy = true;
  $('progressModal').hidden = false;
  $('progressTitle').textContent = 'Creazione del PDF…';
  try {
    const bytes = await buildPdf((pi, frac) => {
      $('progressBar').style.width = `${Math.round(frac * 100)}%`;
      $('progressText').textContent = `Pagina ${pi + 1} di ${state.pages.length}`;
    });
    $('progressTitle').textContent = 'Salvataggio…';
    const name = suggestedName();
    if (window.desktop) {
      $('progressModal').hidden = true;
      const path = await window.desktop.savePdf(bytes, name);
      if (path) {
        toast(`PDF salvato (${formatBytes(bytes.length)})`, {
          type: 'success',
          timeout: 9000,
          actions: [
            { label: 'Apri', icon: 'external', run: () => window.desktop.openPath(path) },
            { label: 'Mostra cartella', icon: 'folder', run: () => window.desktop.showInFolder(path) },
          ],
        });
      }
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast(`PDF creato (${formatBytes(bytes.length)})`, { type: 'success' });
    }
  } catch (err) {
    console.error(err);
    toast(`Errore durante la creazione del PDF: ${err.message || err}`, { type: 'error', timeout: 8000 });
  } finally {
    $('progressModal').hidden = true;
    ui.busy = false;
  }
}

// ---------- toasts ----------

function toast(message, { type = 'info', timeout = 3500, spinner = false, actions = [] } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = spinner ? '<span class="spinner sm"></span>'
    : `<i data-icon="${type === 'success' ? 'check' : type === 'error' ? 'alert' : 'images'}"></i>`;
  el.innerHTML = `${icon}<span class="toast-msg"></span><span class="toast-actions"></span>`;
  el.querySelector('.toast-msg').textContent = message;
  const acts = el.querySelector('.toast-actions');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.innerHTML = `<i data-icon="${a.icon}"></i><span></span>`;
    b.querySelector('span').textContent = a.label;
    b.onclick = () => { a.run(); close(); };
    acts.appendChild(b);
  });
  hydrateIcons(el);
  $('toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  let timer = null;
  function close() {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }
  if (timeout) timer = setTimeout(close, timeout);
  return { close, update: (m) => { el.querySelector('.toast-msg').textContent = m; } };
}

// ---------- theme ----------

const THEMES = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Tema: automatico', light: 'Tema: chiaro', dark: 'Tema: scuro' };
const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' };

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const btn = $('btnTheme');
  btn.title = THEME_LABEL[t];
  const i = btn.querySelector('i');
  i.dataset.icon = THEME_ICON[t];
  hydrateIcons(btn);
}

// ---------- events ----------

function updateSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  render();
}

function bindEvents() {
  $('btnAdd').onclick = () => openFilePicker(null);
  $('btnAddEmpty').onclick = () => openFilePicker(null);
  $('btnAddToPage').onclick = () => { const p = currentPage(); if (p) openFilePicker({ pageId: p.id }); };
  $('fileInput').onchange = (e) => addFiles(e.target.files, ui.pickTarget);
  $('btnExport').onclick = exportPdf;
  $('btnUndo').onclick = () => { if (undo()) render(); };
  $('btnRedo').onclick = () => { if (redo()) render(); };
  $('btnClear').onclick = () => {
    if (!state.pages.length) return;
    pushHistory();
    state.pages = [];
    state.currentPageId = null;
    state.selectedItemId = null;
    render();
    toast('Tutto svuotato', {
      actions: [{ label: 'Annulla', icon: 'undo', run: () => { if (undo()) render(); } }],
      timeout: 6000,
    });
  };
  $('btnTheme').onclick = () => {
    state.settings.theme = THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length];
    saveSettings();
    applyTheme();
  };
  $('btnBlankPage').onclick = () => {
    pushHistory();
    const p = newPage();
    const idx = state.currentPageId ? pageIndex(state.currentPageId) + 1 : state.pages.length;
    state.pages.splice(idx, 0, p);
    selectPage(p.id);
  };
  $('btnMergePrev').onclick = () => {
    const page = currentPage();
    const idx = page ? pageIndex(page.id) : -1;
    if (idx <= 0) return;
    pushHistory();
    const prev = state.pages[idx - 1];
    if (prev.layout === 'free') prev.layout = 'grid';
    prev.items.push(...page.items);
    state.pages.splice(idx, 1);
    state.currentPageId = prev.id;
    state.selectedItemId = null;
    render();
  };

  // Inspector
  $('setPageSize').onchange = (e) => updateSetting('pageSize', e.target.value);
  $('setMargin').oninput = (e) => updateSetting('margin', Number(e.target.value));
  $('setGap').oninput = (e) => updateSetting('gap', Number(e.target.value));
  $('setBg').oninput = (e) => updateSetting('bg', e.target.value);
  $('bgSwatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bg]');
    if (b) updateSetting('bg', b.dataset.bg);
  });
  $('setQuality').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) updateSetting('quality', b.dataset.v);
  });
  $('setOrientation').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const page = currentPage();
    if (!b || !page || page.orientation === b.dataset.v) return;
    pushHistory();
    page.orientation = b.dataset.v;
    if (page.layout === 'free') page.items.forEach((it) => clampItem(page, it));
    render();
  });
  $('setLayout').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const page = currentPage();
    if (!b || !page || page.layout === b.dataset.v) return;
    pushHistory();
    if (b.dataset.v === 'free') makeFree(page);
    else page.layout = b.dataset.v;
    render();
  });

  // Item toolbar
  $('tbItem').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (b && !b.disabled) itemAction(b.dataset.act);
  });

  // Zoom
  $('zoomIn').onclick = () => { ui.zoom = Math.min(4, ui.zoom * 1.25); renderEditor(); };
  $('zoomOut').onclick = () => { ui.zoom = Math.max(0.25, ui.zoom / 1.25); renderEditor(); };
  $('zoomFit').onclick = () => { ui.zoom = 1; renderEditor(); };
  $('canvasScroll').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    ui.zoom = clamp(ui.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.25, 4);
    renderEditor();
  }, { passive: false });

  // Click on empty canvas deselects.
  $('canvasScroll').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.item')) return;
    if (state.selectedItemId) {
      state.selectedItemId = null;
      renderEditor();
    }
  });

  // Page list: select, actions, reorder
  const list = $('pageList');
  list.addEventListener('click', (e) => {
    const thumb = e.target.closest('.thumb');
    if (!thumb) return;
    const act = e.target.closest('[data-act]');
    if (act) pageAction(act.dataset.act, thumb.dataset.id);
    else selectPage(thumb.dataset.id, { scroll: false });
  });
  list.addEventListener('dragstart', (e) => {
    const thumb = e.target.closest('.thumb');
    if (!thumb) return;
    ui.dragPageId = thumb.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-page', thumb.dataset.id);
    requestAnimationFrame(() => thumb.classList.add('ghost'));
  });
  list.addEventListener('dragend', () => {
    ui.dragPageId = null;
    clearDropMarkers();
    list.querySelectorAll('.ghost').forEach((t) => t.classList.remove('ghost'));
  });
  list.addEventListener('dragover', (e) => {
    if (!ui.dragPageId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { index, el, after } = dropPosition(e);
    clearDropMarkers();
    if (el) el.classList.add(after ? 'drop-after' : 'drop-before');
    ui.dropIndex = index;
  });
  list.addEventListener('drop', (e) => {
    if (!ui.dragPageId) return;
    e.preventDefault();
    e.stopPropagation();
    const id = ui.dragPageId;
    clearDropMarkers();
    movePage(id, ui.dropIndex);
  });

  // External file drag & drop
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth += 1;
    document.body.classList.add('file-drag');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove('file-drag');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const onPage = !!e.target.closest?.('#pageEl') && !!currentPage();
    document.body.classList.toggle('drop-on-page', onPage);
    $('dropText').textContent = onPage ? 'Rilascia per aggiungere a questa pagina' : 'Rilascia per aggiungere come nuove pagine';
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('file-drag', 'drop-on-page');
    const page = currentPage();
    let target = null;
    if (page && e.target.closest?.('#pageEl')) {
      const r = $('pageEl').getBoundingClientRect();
      target = { pageId: page.id, at: { x: (e.clientX - r.left) / ui.scale, y: (e.clientY - r.top) / ui.scale } };
    }
    addFiles(e.dataTransfer.files, target);
  });

  // Keyboard
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', () => renderEditor());
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  }
}

function dropPosition(e) {
  const thumbs = [...$('pageList').querySelectorAll('.thumb')];
  for (let i = 0; i < thumbs.length; i++) {
    const r = thumbs[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) return { index: i, el: thumbs[i], after: false };
  }
  const last = thumbs[thumbs.length - 1];
  return { index: thumbs.length, el: last, after: true };
}

function clearDropMarkers() {
  $('pageList').querySelectorAll('.drop-before,.drop-after').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
}

function onKeyDown(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const mod = e.ctrlKey || e.metaKey;

  if (cropIsOpen()) {
    if (e.key === 'Escape') closeCrop();
    if (e.key === 'Enter') applyCrop();
    return;
  }
  if (ui.busy) return;

  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (undo()) render(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); if (redo()) render(); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFilePicker(null); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportPdf(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); itemAction('duplicate'); return; }

  const page = currentPage();
  if (!page) return;
  const idx = pageIndex(page.id);

  if (e.key === 'PageDown' || (!selectedItem() && e.key === 'ArrowDown')) {
    e.preventDefault();
    if (state.pages[idx + 1]) selectPage(state.pages[idx + 1].id);
    return;
  }
  if (e.key === 'PageUp' || (!selectedItem() && e.key === 'ArrowUp')) {
    e.preventDefault();
    if (state.pages[idx - 1]) selectPage(state.pages[idx - 1].id);
    return;
  }

  const item = selectedItem();
  if (!item) {
    if (e.key === 'Delete' && !mod) pageAction('del', page.id);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); itemAction('delete'); return; }
  if (e.key === 'Escape') { state.selectedItemId = null; renderEditor(); return; }
  if (e.key.toLowerCase() === 'r' && !mod) { itemAction(e.shiftKey ? 'rotL' : 'rotR'); return; }
  if (e.key.toLowerCase() === 'c' && !mod) { itemAction('crop'); return; }

  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key]) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (!e.repeat) pushHistory();
    makeFree(page);
    item.x += arrows[e.key][0] * step;
    item.y += arrows[e.key][1] * step;
    clampItem(page, item);
    render();
  }
}

// ---------- boot ----------

function init() {
  hydrateIcons();
  applyTheme();
  initCrop();
  $('selBox').addEventListener('pointerdown', onItemPointerDown);
  bindEvents();
  render();
  if (window.desktop?.onOpenFiles) {
    window.desktop.onOpenFiles((files) => {
      addFiles(files.map((f) => new File([f.data], f.name)), null);
    });
  }
}

init();
