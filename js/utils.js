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

function safePhoto(src) {
  return typeof src === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : '';
}
