'use strict';

const TrombiImport = (() => {
  let s = null; // état de la fenêtre ouverte

  function open({ existing = [], onAdd }) {
    const modal = openModal(`
      <div class="modal-head">
        <h2>Importer un trombinoscope</h2>
        <button class="btn small" data-close>Fermer</button>
      </div>
      <div id="ti-body"></div>`, { onClose: () => document.removeEventListener('paste', onPaste) });
    s = {
      modal, onAdd, img: null, items: [], work: null, running: false,
      existing: new Set(existing.map(st => Model.label(st).toLowerCase())),
      options: { mode: 'auto', cols: 6, rows: 4, namePos: 'auto' },
    };
    modal.root.querySelector('[data-close]').onclick = modal.close;
    document.addEventListener('paste', onPaste);
    showDropzone();
  }

  function body() {
    return s.modal.root.querySelector('#ti-body');
  }

  /* ---------- Étape 1 : choisir l'image ---------- */

  function showDropzone() {
    body().innerHTML = `
      <div class="dropzone" id="ti-drop" tabindex="0">
        <div class="dropzone-icon">🖼️</div>
        <p><strong>Glissez l'image du trombinoscope ici</strong></p>
        <p class="muted">ou cliquez pour choisir un fichier, ou collez une capture d'écran (Ctrl + V)</p>
        <p class="muted small">Formats acceptés : JPG, PNG, WebP… Une image nette et droite donne de meilleurs résultats.</p>
      </div>`;
    const drop = $('#ti-drop', body());
    drop.onclick = async () => { const f = await pickFile('image/*'); if (f) useFile(f); };
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') drop.click(); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = [...e.dataTransfer.files].find(file => file.type.startsWith('image/'));
      if (f) useFile(f); else toast('Déposez un fichier image.');
    };
  }

  function onPaste(e) {
    if (!s || s.running) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) useFile(item.getAsFile());
  }

  async function useFile(file) {
    try {
      s.img = await loadImageFile(file);
    } catch (err) {
      toast(err.message);
      return;
    }
    s.items = [];
    showWorkspace();
  }

  /* ---------- Étape 2 : analyser ---------- */

  function showWorkspace() {
    const o = s.options;
    body().innerHTML = `
      <div class="ti-layout">
        <div class="ti-image"><canvas id="ti-canvas"></canvas></div>
        <div class="ti-side">
          <fieldset>
            <legend>Détection des photos</legend>
            <label class="radio"><input type="radio" name="ti-mode" value="auto" ${o.mode === 'auto' ? 'checked' : ''}> Automatique</label>
            <label class="radio"><input type="radio" name="ti-mode" value="grid" ${o.mode === 'grid' ? 'checked' : ''}> Grille régulière</label>
            <div class="grid-inputs" ${o.mode === 'grid' ? '' : 'hidden'}>
              <input type="number" class="num" id="ti-cols" min="1" max="15" value="${o.cols}"> colonnes ×
              <input type="number" class="num" id="ti-rows" min="1" max="15" value="${o.rows}"> lignes
            </div>
            <p class="muted small">Si la détection automatique se trompe (photos collées entre elles…), utilisez la grille.</p>
          </fieldset>
          <fieldset>
            <legend>Position des noms</legend>
            <select id="ti-namepos">
              <option value="auto" ${o.namePos === 'auto' ? 'selected' : ''}>Automatique</option>
              <option value="below" ${o.namePos === 'below' ? 'selected' : ''}>Sous les photos</option>
              <option value="above" ${o.namePos === 'above' ? 'selected' : ''}>Au-dessus des photos</option>
            </select>
          </fieldset>
          <div class="row-actions">
            <button class="btn primary" id="ti-run">Analyser</button>
            <button class="btn" id="ti-change">Changer d'image</button>
          </div>
          <div class="progress" hidden><div></div></div>
          <p class="muted small" id="ti-status"></p>
          <p class="muted small">La lecture des noms utilise un module de reconnaissance de texte téléchargé
            à la première utilisation (connexion internet nécessaire).</p>
        </div>
      </div>
      <div id="ti-results"></div>`;

    drawOverlay();
    const root = body();
    root.querySelectorAll('input[name="ti-mode"]').forEach(r => r.onchange = () => {
      o.mode = r.value;
      $('.grid-inputs', root).hidden = o.mode !== 'grid';
    });
    $('#ti-cols', root).onchange = e => { o.cols = clampInt(e.target.value, 1, 15, o.cols); e.target.value = o.cols; };
    $('#ti-rows', root).onchange = e => { o.rows = clampInt(e.target.value, 1, 15, o.rows); e.target.value = o.rows; };
    $('#ti-namepos', root).onchange = e => { o.namePos = e.target.value; };
    $('#ti-change', root).onclick = showDropzone;
    $('#ti-run', root).onclick = run;
  }

  function setStatus(text, fraction) {
    const root = body();
    $('#ti-status', root).textContent = text;
    const bar = $('.progress', root);
    bar.hidden = fraction === undefined;
    bar.classList.toggle('indeterminate', fraction === null);
    if (typeof fraction === 'number') bar.firstElementChild.style.width = `${Math.round(fraction * 100)}%`;
  }

  async function run() {
    const root = body();
    const session = s;
    const alive = fn => (...args) => { if (s === session) fn(...args); }; // ignore une fenêtre fermée entre-temps
    s.running = true;
    $('#ti-run', root).disabled = true;
    $('#ti-change', root).disabled = true;
    setStatus('Détection des photos…', null);
    await new Promise(r => setTimeout(r, 30)); // laisse le navigateur afficher le statut

    try {
      await Trombi.analyze(s.img, {
        ...s.options,
        onDetect: alive((items, work) => {
          s.items = items.map(it => ({ ...it, keep: true, edited: false }));
          s.work = work;
          drawOverlay();
          renderResults();
          if (!items.length) setStatus("Aucune photo détectée. Essayez le mode « Grille régulière ».");
        }),
        onItem: alive((it, i) => {
          const item = s.items[i];
          if (!item.edited) Object.assign(item, { lastName: it.lastName, firstName: it.firstName });
          item.raw = it.raw;
          item.usedRegion = it.usedRegion;
          item.read = true;
          item.keep = item.keep && !s.existing.has(Model.label(item).toLowerCase());
          updateResult(i);
          drawOverlay();
        }),
        onProgress: alive(setStatus),
      });
    } catch (err) {
      console.error(err);
      if (s !== session) return;
      setStatus("La lecture automatique des noms n'a pas pu se faire (pas de connexion internet ?). "
        + 'Les photos sont découpées : saisissez les noms à la main.');
      s.items.forEach((it, i) => { it.read = true; updateResult(i); });
    } finally {
      session.running = false;
      $('#ti-run', root).disabled = false;
      $('#ti-change', root).disabled = false;
    }
  }

  function drawOverlay(highlight = -1) {
    const canvas = $('#ti-canvas', body());
    if (!canvas || !s.img) return;
    const scale = Math.min(1, 1400 / Math.max(s.img.naturalWidth, s.img.naturalHeight));
    canvas.width = Math.round(s.img.naturalWidth * scale);
    canvas.height = Math.round(s.img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(s.img, 0, 0, canvas.width, canvas.height);
    if (!s.work) return;

    const k = scale / s.work.scale; // coordonnées de travail → canvas affiché
    const lw = Math.max(2, canvas.width / 500);
    ctx.font = `bold ${Math.round(lw * 7)}px system-ui, sans-serif`;
    s.items.forEach((it, i) => {
      const p = it.photo;
      const hl = i === highlight;
      ctx.lineWidth = hl ? lw * 2 : lw;
      ctx.setLineDash([]);
      ctx.strokeStyle = !it.keep ? '#9aa1ab' : hl ? '#f59e0b' : '#16a34a';
      ctx.strokeRect(p.x * k, p.y * k, p.w * k, p.h * k);
      const region = it.usedRegion || it.nameRegions[0];
      if (region) {
        ctx.setLineDash([lw * 3, lw * 2]);
        ctx.lineWidth = lw;
        ctx.strokeStyle = hl ? '#f59e0b' : '#2563eb';
        ctx.strokeRect(region.x * k, region.y * k, region.w * k, region.h * k);
      }
      const label = String(i + 1);
      const tw = ctx.measureText(label).width + lw * 4;
      ctx.fillStyle = !it.keep ? '#9aa1ab' : hl ? '#f59e0b' : '#16a34a';
      ctx.fillRect(p.x * k, p.y * k, tw, lw * 10);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, p.x * k + lw * 2, p.y * k + lw * 7.5);
    });
  }

  /* ---------- Étape 3 : vérifier et ajouter ---------- */

  function resultHTML(it, i) {
    const duplicate = it.read && s.existing.has(Model.label(it).toLowerCase());
    return `
      <div class="result-item ${it.keep ? '' : 'excluded'}" data-i="${i}">
        <img src="${it.photoURL}" alt="">
        <div class="names">
          <label class="check"><input type="checkbox" data-keep ${it.keep ? 'checked' : ''}> n° ${i + 1}
            ${duplicate ? '<span class="tag">déjà dans la classe</span>' : ''}</label>
          <input type="text" data-key="lastName" placeholder="NOM" value="${esc(it.lastName)}">
          <input type="text" data-key="firstName" placeholder="Prénom" value="${esc(it.firstName)}">
          <div class="raw">${it.read ? (it.raw ? `Lu : « ${esc(it.raw)} »` : 'Nom non lu — à saisir') : 'Lecture…'}</div>
        </div>
      </div>`;
  }

  function renderResults() {
    const root = $('#ti-results', body());
    if (!s.items.length) { root.innerHTML = ''; return; }
    root.innerHTML = `
      <div class="section-head results-head">
        <div>
          <h3>${s.items.length} photo${s.items.length > 1 ? 's' : ''} détectée${s.items.length > 1 ? 's' : ''}</h3>
          <p class="muted small">Vérifiez et corrigez les noms, décochez les cases erronées, puis ajoutez les élèves à la classe.</p>
        </div>
        <div class="row-actions">
          <button class="btn" id="ti-swap">Inverser NOM ⇄ Prénom</button>
          <button class="btn primary" id="ti-add"></button>
        </div>
      </div>
      <div class="result-grid">${s.items.map(resultHTML).join('')}</div>`;
    updateAddButton();

    const grid = $('.result-grid', root);
    grid.oninput = e => {
      const i = +e.target.closest('.result-item').dataset.i;
      const it = s.items[i];
      if (e.target.dataset.key) { it[e.target.dataset.key] = e.target.value; it.edited = true; }
      if (e.target.hasAttribute('data-keep')) {
        it.keep = e.target.checked;
        e.target.closest('.result-item').classList.toggle('excluded', !it.keep);
        updateAddButton();
        drawOverlay(i);
      }
    };
    grid.onchange = e => {
      const key = e.target.dataset.key;
      if (!key) return;
      const it = s.items[+e.target.closest('.result-item').dataset.i];
      it[key] = key === 'lastName' ? formatLastName(it[key]) : formatFirstName(it[key]);
      e.target.value = it[key];
    };
    grid.onmouseover = e => {
      const item = e.target.closest('.result-item');
      if (item) drawOverlay(+item.dataset.i);
    };
    grid.onmouseleave = () => drawOverlay();

    $('#ti-swap', root).onclick = () => {
      s.items.forEach((it, i) => {
        const last = it.lastName;
        it.lastName = formatLastName(it.firstName);
        it.firstName = formatFirstName(last);
        updateResult(i);
      });
    };
    $('#ti-add', root).onclick = () => {
      const chosen = s.items.filter(it => it.keep);
      if (!chosen.length) return;
      s.onAdd(chosen.map(it => ({
        id: uid(),
        lastName: formatLastName(it.lastName),
        firstName: formatFirstName(it.firstName),
        photo: it.photoURL,
      })));
      toast(`${chosen.length} élève${chosen.length > 1 ? 's ajoutés' : ' ajouté'} à la classe.`);
      s.modal.close();
    };
  }

  function updateResult(i) {
    const el = body().querySelector(`.result-item[data-i="${i}"]`);
    if (el) el.outerHTML = resultHTML(s.items[i], i);
    updateAddButton();
  }

  function updateAddButton() {
    const btn = $('#ti-add', body());
    if (!btn) return;
    const n = s.items.filter(it => it.keep).length;
    btn.textContent = `Ajouter ${n} élève${n > 1 ? 's' : ''}`;
    btn.disabled = n === 0;
  }

  return { open };
})();
