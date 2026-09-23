'use strict';

const PlanView = (() => {
  let cls = null;
  let photoCache = new Map();

  async function render(id) {
    cls = await DB.get(id);
    if (!cls) { toast('Classe introuvable.'); location.hash = '#/'; return; }
    Model.sanitize(cls);
    photoCache = await Photos.resolveAll(cls.students);

    $('#app').innerHTML = `
      <div class="plan-head">
        <div>
          <h1>${esc(cls.name)}</h1>
          <p class="muted" id="plan-stats"></p>
        </div>
        <div class="row-actions no-print">
          <a class="btn" href="#/classe/${esc(cls.id)}/modifier">Modifier la classe</a>
          <button class="btn" id="fill-random" title="Place les élèves restants sur les places libres">Placer les restants au hasard</button>
          <button class="btn" id="shuffle">Tout mélanger</button>
          <button class="btn danger" id="clear">Vider le plan</button>
          <button class="btn primary" id="print">Imprimer</button>
        </div>
      </div>
      <div class="plan-layout">
        <div class="plan-main">
          <div class="room" id="room"></div>
          <div class="board">TABLEAU</div>
        </div>
        <aside class="card bench no-print" id="bench"></aside>
      </div>`;

    buildRoom();
    refresh();
    bind();
  }

  function buildRoom() {
    const room = $('#room');
    room.style.gridTemplateColumns = cls.columns.map(c => `minmax(${c.seats * 96}px, ${c.seats}fr)`).join(' ');
    // Le tableau est en bas de page : on affiche la rangée 1 (la plus proche du tableau)
    // en dernier, tout en bas, sans changer le numéro de rangée des places existantes.
    room.innerHTML = cls.columns.map((col, c) => `
      <section class="zone">
        <h3>Colonne ${c + 1}</h3>
        <div class="rows">
          ${Array.from({ length: col.rows }, (_, i) => col.rows - 1 - i).map(r => `
            <div class="row" style="grid-template-columns: repeat(${col.seats}, minmax(88px, 1fr))">
              ${Array.from({ length: col.seats }, (_, p) =>
                `<div class="seat" data-seat="${Model.seatId(c, r, p)}"></div>`).join('')}
            </div>`).join('')}
        </div>
      </section>`).join('');
  }

  function refresh() {
    const byId = new Map(cls.students.map(s => [s.id, s]));
    const placed = new Set(Object.values(cls.assignments));
    const waiting = Model.sorted(cls.students.filter(s => !placed.has(s.id)));
    const options = waiting.map(s => `<option value="${esc(s.id)}">${esc(Model.label(s))}</option>`).join('');

    $$('#room .seat').forEach(seat => {
      const id = seat.dataset.seat;
      const student = byId.get(cls.assignments[id]);
      const [, r, p] = id.split('-');
      seat.classList.toggle('filled', !!student);
      seat.innerHTML = student ? `
        <button class="remove" data-remove title="Retirer de cette place">×</button>
        <div class="person" draggable="true" data-student="${esc(student.id)}">
          ${student.photo ? `<img class="photo" src="${Photos.srcFor(student.photo, photoCache)}" alt="">` : '<div class="photo placeholder"></div>'}
          <div class="first">${esc(student.firstName)}</div>
          <div class="last">${esc(student.lastName)}</div>
        </div>` : `
        <div class="seat-label">Rangée ${r} · Place ${p}</div>
        ${waiting.length ? `<select data-assign aria-label="Choisir un élève"><option value="">— Choisir —</option>${options}</select>` : ''}`;
    });

    $('#bench').innerHTML = `
      <h2>Non placés <span class="count">(${waiting.length})</span></h2>
      <p class="muted small">Glissez un élève sur une place, ou choisissez-le dans la liste d'une place vide.
        Glissez un élève placé ici pour le retirer.</p>
      <div class="bench-list">
        ${waiting.map(s => `
          <div class="bench-item" draggable="true" data-student="${esc(s.id)}">
            ${s.photo ? `<img src="${Photos.srcFor(s.photo, photoCache)}" alt="">` : '<div class="thumb placeholder"></div>'}
            <span>${esc(Model.label(s))}</span>
          </div>`).join('') || '<p class="muted small">Tous les élèves sont placés ✔</p>'}
      </div>`;

    const seats = Model.seatCount(cls);
    const n = cls.students.length;
    $('#plan-stats').textContent = `${n} élève${n > 1 ? 's' : ''} · ${placed.size} placé${placed.size > 1 ? 's' : ''} · ${seats} places`
      + (n > seats ? ` · ⚠ ${n - seats} élève${n - seats > 1 ? 's' : ''} sans place possible` : '');
  }

  async function persist() {
    try {
      await Model.save(cls);
    } catch (err) {
      console.error(err);
      toast("Erreur : le plan n'a pas pu être enregistré.");
    }
  }

  function change(mutate) {
    mutate(cls.assignments);
    refresh();
    persist();
  }

  const seatOf = sid => Object.keys(cls.assignments).find(k => cls.assignments[k] === sid);

  function placeOn(seat, sid) {
    change(a => {
      const from = seatOf(sid);
      if (from === seat) return;
      const occupant = a[seat];
      a[seat] = sid;
      if (from) {
        delete a[from];
        if (occupant) a[from] = occupant; // échange des deux élèves
      }
    });
  }

  function fillRandom(assignments) {
    const placed = new Set(Object.values(assignments));
    const free = shuffle(Model.seats(cls).filter(s => !assignments[s]));
    const waiting = shuffle(cls.students.filter(s => !placed.has(s.id)));
    waiting.slice(0, free.length).forEach((s, i) => { assignments[free[i]] = s.id; });
    return waiting.length - free.length;
  }

  function bind() {
    const room = $('#room'), bench = $('#bench');

    room.addEventListener('change', e => {
      const select = e.target.closest('select[data-assign]');
      if (select && select.value) placeOn(select.closest('.seat').dataset.seat, select.value);
    });
    room.addEventListener('click', e => {
      if (!e.target.closest('[data-remove]')) return;
      const seat = e.target.closest('.seat').dataset.seat;
      change(a => { delete a[seat]; });
    });

    // Glisser-déposer
    $('.plan-layout').addEventListener('dragstart', e => {
      const el = e.target.closest('[data-student]');
      if (!el) return;
      e.dataTransfer.setData('text/plain', el.dataset.student);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    $('.plan-layout').addEventListener('dragend', () => {
      $$('.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
    });
    const dropTarget = (el, onDrop) => {
      el.addEventListener('dragover', e => {
        const target = onDrop.target(e);
        if (!target) return;
        e.preventDefault();
        $$('.drag-over').forEach(x => x !== target && x.classList.remove('drag-over'));
        target.classList.add('drag-over');
      });
      el.addEventListener('dragleave', e => {
        const target = onDrop.target(e);
        if (target && !target.contains(e.relatedTarget)) target.classList.remove('drag-over');
      });
      el.addEventListener('drop', e => {
        const target = onDrop.target(e);
        if (!target) return;
        e.preventDefault();
        target.classList.remove('drag-over');
        const sid = e.dataTransfer.getData('text/plain');
        if (cls.students.some(s => s.id === sid)) onDrop.drop(target, sid);
      });
    };
    dropTarget(room, {
      target: e => e.target.closest('.seat'),
      drop: (seat, sid) => placeOn(seat.dataset.seat, sid),
    });
    dropTarget(bench, {
      target: () => bench,
      drop: (_, sid) => change(a => { const from = seatOf(sid); if (from) delete a[from]; }),
    });

    $('#fill-random').onclick = () => {
      let left = 0;
      change(a => { left = fillRandom(a); });
      if (left > 0) toast(`${left} élève${left > 1 ? 's' : ''} n'${left > 1 ? 'ont' : 'a'} pas de place libre.`);
    };
    $('#shuffle').onclick = async () => {
      if (Object.keys(cls.assignments).length &&
        !await confirmDialog('Replacer tous les élèves au hasard ? Le plan actuel sera remplacé.', { ok: 'Tout mélanger' })) return;
      change(a => {
        for (const k of Object.keys(a)) delete a[k];
        fillRandom(a);
      });
    };
    $('#clear').onclick = async () => {
      if (!Object.keys(cls.assignments).length) return;
      if (!await confirmDialog('Retirer tous les élèves de leur place ?', { ok: 'Vider le plan', danger: true })) return;
      change(a => { for (const k of Object.keys(a)) delete a[k]; });
    };
    $('#print').onclick = () => window.print();
  }

  return { render };
})();
