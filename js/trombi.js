'use strict';

/*
 * Découpage automatique d'un trombinoscope.
 *
 * 1. Détection des photos : on estime la couleur du fond de la page (bords de l'image),
 *    on repère les zones « pleines » qui s'en distinguent, puis on garde les blocs
 *    de taille et de forme comparables (les photos).
 *    Mode « grille » : l'utilisateur donne le nombre de colonnes × lignes et chaque case
 *    est analysée séparément (utile quand les photos se touchent).
 * 2. Lecture des noms : pour chaque photo, la zone juste en dessous (ou au-dessus) est
 *    lue par reconnaissance de texte (Tesseract.js, chargé à la demande).
 */
const Trombi = (() => {
  const WORK_MAX = 2000;
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    + 'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿÆæŒœ';
  const WHITELIST = LETTERS + "-' ";

  /* ---------- Image de travail ---------- */

  function workImage(img) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const scale = Math.min(1, WORK_MAX / Math.max(W, H));
    const w = Math.round(W * scale), h = Math.round(H * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, w, h, scale, data: ctx.getImageData(0, 0, w, h).data };
  }

  function backgroundColor({ data, w, h }) {
    const r = [], g = [], b = [];
    const push = (x, y) => {
      const i = (y * w + x) * 4;
      r.push(data[i]); g.push(data[i + 1]); b.push(data[i + 2]);
    };
    const step = Math.max(1, Math.floor(Math.max(w, h) / 400));
    for (let x = 0; x < w; x += step) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y += step) { push(0, y); push(w - 1, y); }
    const median = a => a.sort((p, q) => p - q)[a.length >> 1];
    return [median(r), median(g), median(b)];
  }

  /** Grille de densité : part de pixels « non fond » dans chaque case de `cell` pixels. */
  function densityGrid(src, bg, threshold = 40) {
    const { data, w, h } = src;
    const cell = Math.max(2, Math.round(Math.max(w, h) / 500));
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const hits = new Uint32Array(gw * gh), total = new Uint32Array(gw * gh);
    const t2 = threshold * threshold;
    for (let y = 0; y < h; y++) {
      const rowBase = ((y / cell) | 0) * gw;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
        const k = rowBase + ((x / cell) | 0);
        total[k]++;
        if (dr * dr + dg * dg + db * db > t2) hits[k]++;
      }
    }
    const dens = new Float32Array(gw * gh);
    for (let k = 0; k < dens.length; k++) dens[k] = hits[k] / total[k];
    return { dens, gw, gh, cell };
  }

  function morph(bin, gw, gh, r, dilate) {
    const out = new Uint8Array(bin.length);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let v = dilate ? 0 : 1;
        for (let dy = -r; dy <= r && v === (dilate ? 0 : 1); dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            const inside = nx >= 0 && ny >= 0 && nx < gw && ny < gh;
            const cellOn = inside ? bin[ny * gw + nx] : 0;
            if (dilate && cellOn) { v = 1; break; }
            if (!dilate && !cellOn) { v = 0; break; }
          }
        }
        out[y * gw + x] = v;
      }
    }
    return out;
  }

  function components(bin, gw, gh) {
    const seen = new Uint8Array(bin.length);
    const stack = new Int32Array(bin.length);
    const comps = [];
    for (let k = 0; k < bin.length; k++) {
      if (!bin[k] || seen[k]) continue;
      let sp = 0, n = 0, x0 = gw, y0 = gh, x1 = 0, y1 = 0;
      stack[sp++] = k;
      seen[k] = 1;
      while (sp) {
        const q = stack[--sp];
        const x = q % gw, y = (q / gw) | 0;
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const neighbours = [x > 0 ? q - 1 : -1, x < gw - 1 ? q + 1 : -1, y > 0 ? q - gw : -1, y < gh - 1 ? q + gw : -1];
        for (const nq of neighbours) {
          if (nq >= 0 && bin[nq] && !seen[nq]) { seen[nq] = 1; stack[sp++] = nq; }
        }
      }
      comps.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, n });
    }
    return comps;
  }

  function mergeClose(boxes, gap) {
    boxes = boxes.map(b => ({ ...b }));
    let merged = true;
    while (merged) {
      merged = false;
      outer:
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.y0 - gap < b.y1 && b.y0 - gap < a.y1) {
            boxes[i] = {
              x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
              x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n,
            };
            boxes.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    return boxes;
  }

  const median = values => values.slice().sort((a, b) => a - b)[values.length >> 1];
  const area = b => (b.x1 - b.x0) * (b.y1 - b.y0);

  /* ---------- Mode automatique ---------- */

  function detectPhotoBoxes(src, grid) {
    const { dens, gw, gh, cell } = grid;
    let bin = new Uint8Array(dens.length);
    for (let k = 0; k < dens.length; k++) bin[k] = dens[k] > 0.5 ? 1 : 0;
    bin = morph(morph(bin, gw, gh, 1, true), gw, gh, 1, false);

    const minSide = Math.max(4, Math.min(gw, gh) * 0.03);
    let boxes = components(bin, gw, gh)
      .filter(c => c.x1 - c.x0 >= minSide / 2 && c.y1 - c.y0 >= minSide / 2);
    boxes = mergeClose(boxes, 2).filter(c => {
      const bw = c.x1 - c.x0, bh = c.y1 - c.y0, ratio = bw / bh;
      return bw >= minSide && bh >= minSide && ratio > 0.4 && ratio < 2.5 && c.n / (bw * bh) > 0.4;
    });
    if (!boxes.length) return [];

    // Les photos d'un trombinoscope ont toutes à peu près la même taille.
    const med = median(boxes.map(area));
    boxes = boxes.filter(b => area(b) > med * 0.35 && area(b) < med * 2.8);

    return boxes.map(b => {
      const x = Math.max(0, (b.x0 - 1) * cell), y = Math.max(0, (b.y0 - 1) * cell);
      return {
        x, y,
        w: Math.min(src.w, (b.x1 + 1) * cell) - x,
        h: Math.min(src.h, (b.y1 + 1) * cell) - y,
      };
    });
  }

  function readingOrder(boxes) {
    const medH = median(boxes.map(b => b.h));
    const cy = b => b.y + b.h / 2;
    const rows = [];
    for (const b of boxes.slice().sort((a, c) => cy(a) - cy(c))) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(cy(b) - row.cy) < medH * 0.5) {
        row.items.push(b);
        row.cy = row.items.reduce((s, it) => s + cy(it), 0) / row.items.length;
      } else {
        rows.push({ cy: cy(b), items: [b] });
      }
    }
    return rows.flatMap((row, r) => row.items.sort((a, c) => a.x - c.x).map(b => ({ ...b, row: r })));
  }

  function autoLayout(src, grid, namePos) {
    const photos = readingOrder(detectPhotoBoxes(src, grid));
    const overlapsX = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w;

    return photos.map(p => {
      const sameRow = photos.filter(o => o.row === p.row && o !== p);
      const left = sameRow.filter(o => o.x < p.x).sort((a, b) => b.x - a.x)[0];
      const right = sameRow.filter(o => o.x > p.x).sort((a, b) => a.x - b.x)[0];
      const x0 = left ? (left.x + left.w + p.x) / 2 : Math.max(0, p.x - p.w * 0.3);
      const x1 = right ? (p.x + p.w + right.x) / 2 : Math.min(src.w, p.x + p.w * 1.3);

      const below = photos.filter(o => o.row > p.row && overlapsX(o, p));
      const above = photos.filter(o => o.row < p.row && overlapsX(o, p));
      const nextTop = below.length ? Math.min(...below.map(o => o.y)) : src.h;
      const prevBottom = above.length ? Math.max(...above.map(o => o.y + o.h)) : 0;

      const belowRect = rect(x0, p.y + p.h, x1, Math.min(p.y + p.h + p.h * 0.7, nextTop));
      const aboveRect = rect(x0, Math.max(p.y - p.h * 0.7, prevBottom), x1, p.y);
      return { photo: p, nameRegions: orderRegions(belowRect, aboveRect, namePos) };
    });
  }

  /* ---------- Mode grille ---------- */

  /** Bandes horizontales non vides (lignes de photos, lignes de noms, titre…). */
  function horizontalBands(grid) {
    const { dens, gw, gh } = grid;
    const bands = [];
    let start = -1;
    for (let y = 0; y <= gh; y++) {
      let filled = 0;
      if (y < gh) for (let x = 0; x < gw; x++) if (dens[y * gw + x] > 0.3) filled++;
      const on = y < gh && filled / gw > 0.02;
      if (on && start < 0) start = y;
      if (!on && start >= 0) { bands.push({ y0: start, y1: y }); start = -1; }
    }
    return bands;
  }

  /** Zone occupée par la grille de photos, en ignorant un éventuel titre ou pied de page. */
  function gridBounds(grid, namePos) {
    const { dens, gw, gh } = grid;
    const bands = horizontalBands(grid);
    if (!bands.length) return { x0: 0, y0: 0, x1: gw, y1: gh };
    const tallest = Math.max(...bands.map(b => b.y1 - b.y0));
    const tall = bands.filter(b => b.y1 - b.y0 >= tallest * 0.5);
    const first = bands.indexOf(tall[0]), last = bands.indexOf(tall[tall.length - 1]);
    let y0 = bands[first].y0, y1 = bands[last].y1;
    const closeGap = tallest * 0.5;
    if (namePos !== 'below' && first > 0 && bands[first].y0 - bands[first - 1].y1 < closeGap) y0 = bands[first - 1].y0;
    if (namePos !== 'above' && last < bands.length - 1 && bands[last + 1].y0 - bands[last].y1 < closeGap) y1 = bands[last + 1].y1;

    let x0 = gw, x1 = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < gw; x++) {
        if (dens[y * gw + x] > 0.3) { if (x < x0) x0 = x; if (x + 1 > x1) x1 = x + 1; }
      }
    }
    if (x1 <= x0) { x0 = 0; x1 = gw; }
    return { x0, y0, x1, y1 };
  }

  function longestRun(values, threshold) {
    let best = null, start = -1;
    for (let i = 0; i <= values.length; i++) {
      const on = i < values.length && values[i] > threshold;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (!best || i - start > best.end - best.start) best = { start, end: i };
        start = -1;
      }
    }
    return best;
  }

  function gridLayout(src, grid, cols, rows, namePos) {
    const { dens, gw, cell } = grid;
    const b = gridBounds(grid, namePos);
    const cw = (b.x1 - b.x0) / cols, ch = (b.y1 - b.y0) / rows;
    const items = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gx0 = Math.round(b.x0 + c * cw), gx1 = Math.round(b.x0 + (c + 1) * cw);
        const gy0 = Math.round(b.y0 + r * ch), gy1 = Math.round(b.y0 + (r + 1) * ch);
        const rowProfile = [];
        for (let y = gy0; y < gy1; y++) {
          let s = 0;
          for (let x = gx0; x < gx1; x++) s += dens[y * gw + x];
          rowProfile.push(s / Math.max(1, gx1 - gx0));
        }
        let py = longestRun(rowProfile, 0.35);
        if (!py || py.end - py.start < (gy1 - gy0) * 0.3) {
          py = namePos === 'above'
            ? { start: Math.round((gy1 - gy0) * 0.25), end: gy1 - gy0 }
            : { start: 0, end: Math.round((gy1 - gy0) * 0.75) };
        }
        const colProfile = [];
        for (let x = gx0; x < gx1; x++) {
          let s = 0;
          for (let y = gy0 + py.start; y < gy0 + py.end; y++) s += dens[y * gw + x];
          colProfile.push(s / Math.max(1, py.end - py.start));
        }
        let px = longestRun(colProfile, 0.35);
        if (!px || px.end - px.start < (gx1 - gx0) * 0.2) px = { start: 0, end: gx1 - gx0 };

        const photo = {
          x: (gx0 + px.start) * cell, y: (gy0 + py.start) * cell,
          w: (px.end - px.start) * cell, h: (py.end - py.start) * cell,
        };
        const belowRect = rect(gx0 * cell, photo.y + photo.h, gx1 * cell, gy1 * cell);
        const aboveRect = rect(gx0 * cell, gy0 * cell, gx1 * cell, photo.y);
        items.push({ photo: clampRect(photo, src), nameRegions: orderRegions(belowRect, aboveRect, namePos) });
      }
    }
    return items;
  }

  /* ---------- Outils de rectangles ---------- */

  function rect(x0, y0, x1, y1) {
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  }

  function clampRect(r, src) {
    const x = Math.max(0, Math.min(src.w - 1, r.x)), y = Math.max(0, Math.min(src.h - 1, r.y));
    return { x, y, w: Math.max(1, Math.min(src.w - x, r.w)), h: Math.max(1, Math.min(src.h - y, r.h)) };
  }

  function orderRegions(belowRect, aboveRect, namePos) {
    const usable = r => r.w > 8 && r.h > 6;
    const list = namePos === 'above' ? [aboveRect] : namePos === 'below' ? [belowRect] : [belowRect, aboveRect];
    return list.filter(usable);
  }

  /* ---------- Lecture des noms ---------- */

  let workerPromise = null;
  let logHandler = null;

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chargement impossible'));
      document.head.appendChild(s);
    });
  }

  async function getWorker() {
    if (!window.Tesseract) await loadScript(TESSERACT_URL);
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('fra', 1, { logger: m => logHandler && logHandler(m) })
        .then(async worker => {
          await worker.setParameters({
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: WHITELIST,
          });
          return worker;
        });
      workerPromise.catch(() => { workerPromise = null; });
    }
    return workerPromise;
  }

  async function readText(worker, img, r) {
    const scale = Math.max(1, Math.min(4, 900 / r.w));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(r.w * scale);
    canvas.height = Math.round(r.h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  }

  const NON_NAME = new RegExp(`[^${LETTERS}' -]`, 'g');

  /** Garde la première ligne lisible (et la suivante si la première n'a qu'un mot). */
  function pickName(text) {
    const lines = text.split('\n')
      .map(l => l.replace(NON_NAME, ' ').split(/\s+/).filter(t => t.replace(/['-]/g, '').length >= 2).join(' '))
      .filter(Boolean);
    if (!lines.length) return '';
    let words = lines[0].split(' ');
    if (words.length < 2 && lines[1]) words = words.concat(lines[1].split(' '));
    return words.join(' ');
  }

  /**
   * Sépare NOM et prénom : les mots en MAJUSCULES forment le nom.
   * Sans indice de casse : « Prénom Nom » si écrit en minuscules, « NOM PRÉNOM » si tout en capitales.
   */
  function splitName(raw) {
    const tokens = raw.split(' ').filter(Boolean);
    if (!tokens.length) return { lastName: '', firstName: '' };
    const isUpper = t => t === t.toLocaleUpperCase('fr-FR') && t !== t.toLocaleLowerCase('fr-FR');
    const upper = tokens.filter(isUpper), other = tokens.filter(t => !isUpper(t));
    let last, first;
    if (upper.length && other.length) { last = upper; first = other; }
    else if (tokens.length === 1) { last = tokens; first = []; }
    else if (upper.length) { last = tokens.slice(0, -1); first = tokens.slice(-1); }
    else { first = tokens.slice(0, 1); last = tokens.slice(1); }
    return { lastName: formatLastName(last.join(' ')), firstName: formatFirstName(first.join(' ')) };
  }

  /* ---------- Point d'entrée ---------- */

  /**
   * @param img        HTMLImageElement du trombinoscope
   * @param options    { mode: 'auto'|'grid', cols, rows, namePos: 'auto'|'below'|'above',
   *                     onDetect(items, work), onItem(item, index), onProgress(text, fraction|null) }
   */
  async function analyze(img, options) {
    const { mode = 'auto', cols = 1, rows = 1, namePos = 'auto' } = options;
    const onProgress = options.onProgress || (() => {});
    const work = workImage(img);
    const grid = densityGrid(work, backgroundColor(work));
    const layout = mode === 'grid' ? gridLayout(work, grid, cols, rows, namePos) : autoLayout(work, grid, namePos);
    const toOriginal = r => ({ x: r.x / work.scale, y: r.y / work.scale, w: r.w / work.scale, h: r.h / work.scale });

    const items = layout.map(it => {
      const p = toOriginal(it.photo);
      return { ...it, photoURL: cropToDataURL(img, p.x, p.y, p.w, p.h), raw: '', lastName: '', firstName: '', read: false };
    });
    if (options.onDetect) options.onDetect(items, work);
    if (!items.length) return items;

    onProgress('Chargement de la reconnaissance de texte…', null);
    logHandler = m => {
      if (m.status && m.status !== 'recognizing text') {
        onProgress('Chargement de la reconnaissance de texte…', typeof m.progress === 'number' ? m.progress * 0.2 : null);
      }
    };
    const worker = await getWorker();
    logHandler = null;

    for (let i = 0; i < items.length; i++) {
      onProgress(`Lecture des noms… ${i + 1} / ${items.length}`, 0.2 + 0.8 * (i / items.length));
      const it = items[i];
      for (const region of it.nameRegions) {
        it.raw = pickName(await readText(worker, img, toOriginal(region)));
        if (it.raw) { it.usedRegion = region; break; }
      }
      Object.assign(it, splitName(it.raw), { read: true });
      if (options.onItem) options.onItem(it, i);
    }
    onProgress(`Terminé : ${items.length} élèves détectés.`, 1);
    return items;
  }

  return { analyze, splitName };
})();
