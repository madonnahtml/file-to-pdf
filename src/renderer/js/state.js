// Application state, settings persistence and undo history.
//
// Pages and items are plain JSON so they can be snapshotted for undo.
// Decoded images ("sources") live outside the snapshots in `sources`.
//
// Units: every page / item coordinate is in millimetres.

const PAGE_SIZES = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
// Long side of the content area when the page size is "fit to image".
const FIT_LONG_SIDE = 280;

const QUALITY = {
  max:    { dpi: Infinity, jpeg: 0.95, lossless: true,  hint: 'Risoluzione originale, nessuna perdita visibile. File più grandi.' },
  high:   { dpi: 300,      jpeg: 0.9,  lossless: true,  hint: '300 DPI: ideale per la stampa.' },
  medium: { dpi: 200,      jpeg: 0.8,  lossless: false, hint: '200 DPI: ottimo compromesso tra qualità e peso.' },
  low:    { dpi: 120,      jpeg: 0.65, lossless: false, hint: '120 DPI: file molto leggeri, perfetti per email e WhatsApp.' },
};

const DEFAULT_SETTINGS = {
  pageSize: 'A4',
  margin: 10,
  gap: 6,
  bg: '#ffffff',
  quality: 'high',
  theme: 'system',
};

const state = {
  settings: loadSettings(),
  /** @type {Map<string, {id:string,name:string,url:string,img:HTMLImageElement,width:number,height:number,lossless:boolean}>} */
  sources: new Map(),
  pages: [],
  currentPageId: null,
  selectedItemId: null,
};

let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('settings') || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem('settings', JSON.stringify(state.settings));
  } catch { /* storage unavailable: settings just won't persist */ }
}

// ---------- lookups ----------

function currentPage() {
  return state.pages.find((p) => p.id === state.currentPageId) || null;
}

function pageIndex(pageId) {
  return state.pages.findIndex((p) => p.id === pageId);
}

function selectedItem() {
  const page = currentPage();
  return page ? page.items.find((it) => it.id === state.selectedItemId) || null : null;
}

// ---------- geometry ----------

/** Pixel size of the item's visible area (after rotation and crop). */
function itemPixelSize(item) {
  const src = state.sources.get(item.srcId);
  if (!src) return { w: 1, h: 1 };
  const rotated = item.rotation % 180 !== 0;
  const rw = rotated ? src.height : src.width;
  const rh = rotated ? src.width : src.height;
  return { w: Math.max(1, rw * item.crop.w), h: Math.max(1, rh * item.crop.h) };
}

/** width / height of the item as displayed. */
function itemAspect(item) {
  const { w, h } = itemPixelSize(item);
  return w / h;
}

function itemHeight(item) {
  return item.w / itemAspect(item);
}

function newItem(srcId) {
  return { id: uid('i'), srcId, rotation: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, x: 0, y: 0, w: 50 };
}

function newPage(items = []) {
  return { id: uid('p'), orientation: 'auto', layout: 'grid', items };
}

// ---------- undo / redo ----------

const hist = { undo: [], redo: [] };
const HISTORY_LIMIT = 80;

function snapshot() {
  return JSON.stringify({ pages: state.pages, currentPageId: state.currentPageId, selectedItemId: state.selectedItemId });
}

/** Call before mutating pages so the change can be undone. */
function pushHistory() {
  hist.undo.push(snapshot());
  if (hist.undo.length > HISTORY_LIMIT) hist.undo.shift();
  hist.redo.length = 0;
}

function restore(snap) {
  const data = JSON.parse(snap);
  state.pages = data.pages;
  state.currentPageId = data.currentPageId;
  state.selectedItemId = data.selectedItemId;
}

function undo() {
  if (!hist.undo.length) return false;
  hist.redo.push(snapshot());
  restore(hist.undo.pop());
  return true;
}

function redo() {
  if (!hist.redo.length) return false;
  hist.undo.push(snapshot());
  restore(hist.redo.pop());
  return true;
}
