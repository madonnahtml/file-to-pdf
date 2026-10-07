// Page geometry and automatic layouts. All values in millimetres.

function baseSize(page) {
  const key = state.settings.pageSize === 'fit' ? 'A4' : state.settings.pageSize;
  return PAGE_SIZES[key] || PAGE_SIZES.A4;
}

function isFitPage(page) {
  return state.settings.pageSize === 'fit' && page.items.length === 1;
}

/** Page width/height in mm. */
function pageDims(page) {
  const m = state.settings.margin;
  if (isFitPage(page)) {
    const a = itemAspect(page.items[0]);
    const cw = a >= 1 ? FIT_LONG_SIDE : FIT_LONG_SIDE * a;
    const ch = a >= 1 ? FIT_LONG_SIDE / a : FIT_LONG_SIDE;
    return { w: cw + 2 * m, h: ch + 2 * m };
  }
  const [w, h] = baseSize(page);
  return resolveOrientation(page) === 'landscape' ? { w: h, h: w } : { w, h };
}

function contentBox(page, dims = pageDims(page)) {
  const m = Math.min(state.settings.margin, dims.w / 2 - 5, dims.h / 2 - 5);
  return { x: m, y: m, w: dims.w - 2 * m, h: dims.h - 2 * m };
}

/** "auto" picks the orientation in which the images cover the most area. */
function resolveOrientation(page) {
  if (page.orientation !== 'auto') return page.orientation;
  if (!page.items.length || page.layout === 'free') return 'portrait';
  const [w, h] = baseSize(page);
  const m = state.settings.margin;
  const coverage = (pw, ph) => arrange(page.items, { x: m, y: m, w: pw - 2 * m, h: ph - 2 * m }, page.layout).area;
  return coverage(h, w) > coverage(w, h) * 1.02 ? 'landscape' : 'portrait';
}

/**
 * Computes positions for `items` inside `box`.
 * Returns { rects: [{x,y,w}], area } – heights follow from each item's aspect.
 */
function arrange(items, box, layout) {
  const n = items.length;
  if (!n || box.w <= 0 || box.h <= 0) return { rects: [], area: 0 };
  const gap = state.settings.gap;
  const aspects = items.map(itemAspect);

  if (layout === 'row' || layout === 'column') {
    // Justified strip: every image shares the same height (row) or width (column).
    const rects = [];
    let area = 0;
    if (layout === 'row') {
      const sumA = aspects.reduce((s, a) => s + a, 0);
      const h = Math.max(1, Math.min(box.h, (box.w - gap * (n - 1)) / sumA));
      const total = sumA * h + gap * (n - 1);
      let x = box.x + (box.w - total) / 2;
      const y = box.y + (box.h - h) / 2;
      aspects.forEach((a) => {
        rects.push({ x, y, w: a * h });
        area += a * h * h;
        x += a * h + gap;
      });
    } else {
      const sumInv = aspects.reduce((s, a) => s + 1 / a, 0);
      const w = Math.max(1, Math.min(box.w, (box.h - gap * (n - 1)) / sumInv));
      const total = sumInv * w + gap * (n - 1);
      let y = box.y + (box.h - total) / 2;
      const x = box.x + (box.w - w) / 2;
      aspects.forEach((a) => {
        rects.push({ x, y, w });
        area += (w * w) / a;
        y += w / a + gap;
      });
    }
    return { rects, area };
  }

  // Grid: try every column count and keep the one covering the most area.
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (box.w - gap * (cols - 1)) / cols;
    const ch = (box.h - gap * (rows - 1)) / rows;
    if (cw <= 1 || ch <= 1) continue;
    let area = 0;
    const rects = aspects.map((a, i) => {
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const offset = ((cols - inRow) * (cw + gap)) / 2; // centre an incomplete last row
      const c = i % cols;
      const w = Math.min(cw, ch * a);
      const h = w / a;
      area += w * h;
      return {
        x: box.x + offset + c * (cw + gap) + (cw - w) / 2,
        y: box.y + r * (ch + gap) + (ch - h) / 2,
        w,
      };
    });
    if (!best || area > best.area) best = { rects, area };
  }
  return best || { rects: items.map(() => ({ x: box.x, y: box.y, w: Math.min(box.w, box.h) })), area: 0 };
}

/** Recomputes item positions for automatic layouts (no-op for "free"). */
function applyLayout(page) {
  if (page.layout === 'free' && !isFitPage(page)) return;
  const { rects } = arrange(page.items, contentBox(page), isFitPage(page) ? 'grid' : page.layout);
  page.items.forEach((it, i) => Object.assign(it, rects[i]));
}

/** Switch a page to free layout, freezing what the user currently sees. */
function makeFree(page) {
  if (page.layout === 'free') return;
  applyLayout(page);
  page.orientation = resolveOrientation(page);
  page.layout = 'free';
}

/** Largest centred placement of `item` inside the page content box. */
function fitItem(page, item) {
  const box = contentBox(page);
  const a = itemAspect(item);
  const w = Math.min(box.w, box.h * a);
  item.w = w;
  item.x = box.x + (box.w - w) / 2;
  item.y = box.y + (box.h - w / a) / 2;
}

/** Keeps an item at least partly on the page. */
function clampItem(page, item) {
  const d = pageDims(page);
  const h = itemHeight(item);
  const keep = 8;
  item.w = clamp(item.w, 5, d.w * 3);
  item.x = clamp(item.x, keep - item.w, d.w - keep);
  item.y = clamp(item.y, keep - h, d.h - keep);
}
