'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function slugify(text) {
  return String(text || 'classe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'classe';
}

/* ---------- Noms ---------- */

function formatLastName(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('fr-FR');
}

function formatFirstName(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr-FR')
    .replace(/(^|[\s'-])(\p{L})/gu, (m, sep, letter) => sep + letter.toLocaleUpperCase('fr-FR'));
}

/* ---------- Notifications et fenêtres ---------- */

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function openModal(html, { small = false, onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal${small ? ' small' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(backdrop);
  document.body.classList.add('no-scroll');
  const close = () => {
    backdrop.remove();
    if (!$('.modal-backdrop')) document.body.classList.remove('no-scroll');
    if (onClose) onClose();
  };
  return { root: backdrop.querySelector('.modal'), close };
}

function confirmDialog(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise(resolve => {
    const m = openModal(`
      <p class="confirm-text">${esc(message)}</p>
      <div class="row-actions end">
        <button class="btn" data-no>Annuler</button>
        <button class="btn ${danger ? 'danger-solid' : 'primary'}" data-yes>${esc(ok)}</button>
      </div>`, { small: true });
    m.root.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
    m.root.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
    m.root.querySelector('[data-yes]').focus();
  });
}

/* ---------- Fichiers et images ---------- */

function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de lire cette image."));
    img.src = src;
  });
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  return loadImage(url).finally(() => URL.revokeObjectURL(url));
}

/** Découpe une zone d'une image et la renvoie en JPEG (data URL), hauteur limitée. */
function cropToDataURL(source, sx, sy, sw, sh, maxHeight = 320) {
  const scale = Math.min(1, maxHeight / sh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function fileToPhoto(file) {
  const img = await loadImageFile(file);
  return cropToDataURL(img, 0, 0, img.naturalWidth, img.naturalHeight);
}

/** Ouvre une fenêtre de recadrage pour `img` (déjà chargée) ; renvoie le JPEG recadré en data URL,
 *  ou null si annulé. */
function cropModal(img) {
  return new Promise(resolve => {
    const maxW = Math.min(520, window.innerWidth - 80);
    const maxH = Math.min(460, window.innerHeight - 220);
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const dispW = Math.max(40, Math.round(img.naturalWidth * scale));
    const dispH = Math.max(40, Math.round(img.naturalHeight * scale));
    img.style.cssText = `display:block; width:${dispW}px; height:${dispH}px;`;

    const box = { x: dispW * 0.15, y: dispH * 0.1, w: dispW * 0.7, h: dispH * 0.8 };
    const MIN = 24;

    const modal = openModal(`
      <div class="modal-head">
        <h2>Rogner la photo</h2>
        <button class="btn small" data-cancel>Fermer</button>
      </div>
      <p class="muted small">Faites glisser le cadre pour le déplacer, ses coins pour le redimensionner.</p>
      <div class="crop-stage" id="crop-stage" style="width:${dispW}px;height:${dispH}px;">
        <div class="crop-box" id="crop-box">
          <div class="crop-handle" data-h="nw"></div>
          <div class="crop-handle" data-h="ne"></div>
          <div class="crop-handle" data-h="sw"></div>
          <div class="crop-handle" data-h="se"></div>
        </div>
      </div>
      <div class="row-actions end">
        <button class="btn" data-cancel>Annuler</button>
        <button class="btn primary" data-ok>Rogner</button>
      </div>`, { onClose: () => finish(null) });

    const stage = $('#crop-stage', modal.root);
    const cropBox = $('#crop-box', modal.root);
    stage.insertBefore(img, cropBox);

    let done = false;
    function finish(result) {
      if (done) return;
      done = true;
      modal.close();
      resolve(result);
    }

    function paint() {
      cropBox.style.left = `${box.x}px`;
      cropBox.style.top = `${box.y}px`;
      cropBox.style.width = `${box.w}px`;
      cropBox.style.height = `${box.h}px`;
    }
    paint();

    function drag(onMove) {
      const up = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', up);
    }

    cropBox.addEventListener('pointerdown', e => {
      if (e.target.closest('.crop-handle')) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY, ox = box.x, oy = box.y;
      drag(ev => {
        box.x = Math.max(0, Math.min(dispW - box.w, ox + (ev.clientX - startX)));
        box.y = Math.max(0, Math.min(dispH - box.h, oy + (ev.clientY - startY)));
        paint();
      });
    });

    $$('.crop-handle', cropBox).forEach(handle => {
      handle.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const h = handle.dataset.h;
        const startX = e.clientX, startY = e.clientY;
        const start = { ...box };
        drag(ev => {
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          let { x, y, w, h: bh } = start;
          if (h.includes('w')) { x = Math.max(0, Math.min(start.x + start.w - MIN, start.x + dx)); w = start.x + start.w - x; }
          if (h.includes('e')) { w = Math.max(MIN, Math.min(dispW - start.x, start.w + dx)); }
          if (h.includes('n')) { y = Math.max(0, Math.min(start.y + start.h - MIN, start.y + dy)); bh = start.y + start.h - y; }
          if (h.includes('s')) { bh = Math.max(MIN, Math.min(dispH - start.y, start.h + dy)); }
          Object.assign(box, { x, y, w, h: bh });
          paint();
        });
      });
    });

    modal.root.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => finish(null));
    $('[data-ok]', modal.root).onclick = () => {
      finish(cropToDataURL(img, box.x / scale, box.y / scale, box.w / scale, box.h / scale));
    };
  });
}

function safePhoto(src) {
  return typeof src === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : '';
}
