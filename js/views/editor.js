'use strict';

const EditorView = (() => {
  let state = null; // { cls, isNew, dirty }

  function markDirty() {
    state.dirty = true;
  }

  async function render(id) {
    const stored = id ? await DB.get(id) : Model.create();
    if (!stored) { toast('Classe introuvable.'); location.hash = '#/'; return; }
    state = { cls: structuredClone(stored), isNew: !id, dirty: false };
    App.setLeaveGuard(() => state.dirty);

    const cls = state.cls;
    $('#app').innerHTML = `
      <div class="page-head">
        <h1>${state.isNew ? 'Nouvelle classe' : `Modifier « ${esc(cls.name)} »`}</h1>
      </div>
      <div class="editor">
        <section class="card">
          <h2><span class="step">1</span> Nom de la classe</h2>
          <input type="text" id="cls-name" class="wide" maxlength="80" placeholder="ex. 4e B — 2026-2027" value="${esc(cls.name)}">
        </section>

        <section class="card">
          <h2><span class="step">2</span> Disposition de la salle</h2>
          <p class="muted small">Les colonnes sont numérotées de gauche à droite <strong>en regardant le tableau</strong>.
            La rangée 1 est la plus proche du tableau.</p>
          <label class="inline-field">Nombre de colonnes
            <input type="number" id="nb-cols" class="num" min="1" max="12" value="${cls.columns.length}">
          </label>
          <div class="cols-config" id="cols-config"></div>
          <div class="layout-preview" id="layout-preview"></div>
          <p class="layout-summary" id="layout-summary"></p>
        </section>

        <section class="card">
          <div class="section-head">
            <h2><span class="step">3</span> Élèves <span class="count" id="student-count"></span></h2>
            <div class="row-actions">
              <button class="btn primary" id="btn-trombi">Importer un trombinoscope</button>
              <button class="btn" id="btn-add">+ Ajouter un élève</button>
              <button class="btn" id="btn-sort">Trier A → Z</button>
              <button class="btn danger" id="btn-clear">Tout supprimer</button>
            </div>
          </div>
          <div class="student-grid" id="students"></div>
        </section>

        <div class="editor-footer">
          <a class="btn" href="${state.isNew ? '#/' : `#/classe/${esc(cls.id)}`}">Annuler</a>
          <button class="btn" id="btn-save">Enregistrer</button>
          <button class="btn primary" id="btn-save-open">Enregistrer et ouvrir le plan</button>
        </div>
      </div>`;

    renderColumns();
    renderPreview();
    renderStudents();
    bind();
    if (state.isNew) $('#cls-name').focus();
  }

  /* ---------- Disposition ---------- */

  function renderColumns() {
    $('#cols-config').innerHTML = state.cls.columns.map((col, i) => `
      <div class="col-cfg">
        <strong>Colonne ${i + 1}</strong>
        <label class="inline"><input type="number" class="num" data-col="${i}" data-key="rows" min="1" max="20" value="${col.rows}"> rangées</label>
        <label class="inline"><input type="number" class="num" data-col="${i}" data-key="seats" min="1" max="10" value="${col.seats}"> places par rangée</label>
      </div>`).join('');
  }

  function renderPreview() {
    const cls = state.cls;
    $('#layout-preview').innerHTML = `
      <div class="mini-board">TABLEAU</div>
      <div class="mini-room">
        ${cls.columns.map((col, i) => `
          <div class="mini-col">
            ${Array.from({ length: col.rows }, () => `
              <div class="mini-row">${'<span class="mini-seat"></span>'.repeat(col.seats)}</div>`).join('')}
            <div class="mini-caption">Col. ${i + 1} · ${col.rows * col.seats} pl.</div>
          </div>`).join('')}
      </div>`;

    const seats = Model.seatCount(cls);
    const students = cls.students.length;
    const valid = new Set(Model.seats(cls));
    const lost = Object.keys(cls.assignments).filter(s => !valid.has(s)).length;
    const warnings = [];
    if (students > seats) warnings.push(`il manque ${students - seats} place${students - seats > 1 ? 's' : ''} pour tous les élèves`);
    if (lost) warnings.push(`${lost} élève${lost > 1 ? 's' : ''} déjà placé${lost > 1 ? 's' : ''} perdr${lost > 1 ? 'ont' : 'a'} sa place`);
    $('#layout-summary').innerHTML = `<strong>${seats} places</strong> pour ${students} élève${students > 1 ? 's' : ''}`
      + (warnings.length ? ` <span class="warn">⚠ Attention : ${warnings.join(' ; ')}.</span>` : '');
  }

  function setColumnCount(n) {
    const cols = state.cls.columns;
    while (cols.length < n) cols.push({ ...cols[cols.length - 1] });
    cols.length = n;
    markDirty();
    renderColumns();
    renderPreview();
  }

  /* ---------- Élèves ---------- */

  function studentHTML(s) {
    return `
      <div class="student-item" data-id="${esc(s.id)}">
        <button class="photo-btn" title="Changer la photo">
          ${s.photo ? `<img src="${s.photo}" alt="">` : '<span>+ photo</span>'}
        </button>
        <div class="names">
          <input type="text" data-key="lastName" placeholder="NOM" value="${esc(s.lastName)}">
          <input type="text" data-key="firstName" placeholder="Prénom" value="${esc(s.firstName)}">
        </div>
        <button class="icon-btn" data-act="delete" title="Supprimer cet élève">×</button>
      </div>`;
  }

  function renderStudents() {
    const list = state.cls.students;
    $('#student-count').textContent = `(${list.length})`;
    $('#students').innerHTML = list.length ? list.map(studentHTML).join('')
      : '<p class="muted empty-students">Aucun élève. Importez un trombinoscope ou ajoutez les élèves un par un.</p>';
    renderPreview();
  }

  function addStudents(newOnes) {
    state.cls.students.push(...newOnes);
    markDirty();
    renderStudents();
  }

  /* ---------- Événements ---------- */

  function bind() {
    const cls = state.cls;

    $('#cls-name').oninput = e => { cls.name = e.target.value; markDirty(); };

    $('#nb-cols').oninput = e => {
      const n = parseInt(e.target.value, 10);
      if (n >= 1 && n <= 12 && n !== cls.columns.length) setColumnCount(n);
    };
    $('#nb-cols').onchange = e => { e.target.value = cls.columns.length; };

    $('#cols-config').oninput = e => {
      const input = e.target.closest('input[data-col]');
      if (!input) return;
      const max = input.dataset.key === 'rows' ? 20 : 10;
      const n = parseInt(input.value, 10);
      if (n >= 1 && n <= max) {
        cls.columns[input.dataset.col][input.dataset.key] = n;
        markDirty();
        renderPreview();
      }
    };
    $('#cols-config').onchange = e => {
      const input = e.target.closest('input[data-col]');
      if (input) input.value = cls.columns[input.dataset.col][input.dataset.key];
    };

    const studentOf = el => cls.students.find(s => s.id === el.closest('.student-item').dataset.id);

    $('#students').oninput = e => {
      if (!e.target.dataset.key) return;
      studentOf(e.target)[e.target.dataset.key] = e.target.value;
      markDirty();
    };
    $('#students').onchange = e => {
      const key = e.target.dataset.key;
      if (!key) return;
      const s = studentOf(e.target);
      s[key] = key === 'lastName' ? formatLastName(s[key]) : formatFirstName(s[key]);
      e.target.value = s[key];
    };
    $('#students').onclick = async e => {
      const item = e.target.closest('.student-item');
      if (!item) return;
      const s = studentOf(item);
      if (e.target.closest('[data-act="delete"]')) {
        cls.students = cls.students.filter(x => x !== s);
        markDirty();
        renderStudents();
      } else if (e.target.closest('.photo-btn')) {
        const file = await pickFile('image/*');
        if (!file) return;
        try {
          s.photo = await fileToPhoto(file);
          markDirty();
          item.outerHTML = studentHTML(s);
        } catch (err) { toast(err.message); }
      }
    };

    $('#btn-add').onclick = () => {
      addStudents([{ id: uid(), lastName: '', firstName: '', photo: '' }]);
      const inputs = $$('#students .student-item:last-child input');
      if (inputs[0]) inputs[0].focus();
    };
    $('#btn-sort').onclick = () => {
      cls.students = Model.sorted(cls.students);
      markDirty();
      renderStudents();
    };
    $('#btn-clear').onclick = async () => {
      if (!cls.students.length) return;
      if (!await confirmDialog(`Retirer les ${cls.students.length} élèves de cette classe ?`, { ok: 'Tout supprimer', danger: true })) return;
      cls.students = [];
      markDirty();
      renderStudents();
    };
    $('#btn-trombi').onclick = () => TrombiImport.open({ existing: cls.students, onAdd: addStudents });

    $('#btn-save').onclick = () => save(false);
    $('#btn-save-open').onclick = () => save(true);
  }

  async function save(openPlan) {
    const cls = state.cls;
    cls.name = cls.name.trim();
    if (!cls.name) {
      toast('Donnez un nom à la classe.');
      $('#cls-name').focus();
      return;
    }
    Model.sanitize(cls);
    await Model.save(cls);
    state.dirty = false;
    toast('Classe enregistrée.');
    if (openPlan) {
      location.hash = `#/classe/${cls.id}`;
    } else if (state.isNew) {
      state.isNew = false;
      history.replaceState(null, '', `#/classe/${cls.id}/modifier`);
      App.rememberHash();
      $('.page-head h1').textContent = `Modifier « ${cls.name} »`;
      $('.editor-footer a').setAttribute('href', `#/classe/${cls.id}`);
    }
    renderPreview();
  }

  return { render };
})();
