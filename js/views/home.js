'use strict';

const HomeView = (() => {
  function plural(n, word) {
    return `${n} ${word}${n > 1 ? 's' : ''}`;
  }

  function cardHTML(cls) {
    const n = cls.students.length;
    const placed = Object.keys(cls.assignments).length;
    const faces = cls.students.filter(s => s.photo).slice(0, 8);
    const more = n - faces.length;
    return `
      <article class="card class-card" data-id="${esc(cls.id)}">
        <div>
          <h3>${esc(cls.name || 'Classe sans nom')}</h3>
          <div class="muted small">${plural(n, 'élève')} · ${plural(Model.seatCount(cls), 'place')} · ${plural(cls.columns.length, 'colonne')}</div>
        </div>
        <div class="faces">
          ${faces.map(s => `<img src="${s.photo}" alt="" title="${esc(Model.label(s))}">`).join('')}
          ${more > 0 ? `<span class="more">+${more}</span>` : ''}
          ${n === 0 ? '<span class="muted small">Aucun élève pour l’instant</span>' : ''}
        </div>
        <div class="muted small">${placed} / ${n} placés · modifiée le ${formatDate(cls.updatedAt)}</div>
        <div class="row-actions">
          <a class="btn primary small" href="#/classe/${esc(cls.id)}">Ouvrir le plan</a>
          <a class="btn small" href="#/classe/${esc(cls.id)}/modifier">Modifier</a>
          <button class="btn small" data-act="duplicate">Dupliquer</button>
          <button class="btn small" data-act="export">Exporter</button>
          <button class="btn small danger" data-act="delete">Supprimer</button>
        </div>
      </article>`;
  }

  async function render() {
    const classes = (await DB.all()).sort((a, b) => b.updatedAt - a.updatedAt);
    $('#app').innerHTML = `
      <section class="hero">
        <div>
          <h1>Mes classes</h1>
          <p class="muted">Créez une classe, importez son trombinoscope, puis placez les élèves sur le plan.</p>
        </div>
        <div class="row-actions">
          <button class="btn" id="import-backup">Importer une sauvegarde</button>
          ${classes.length ? '<button class="btn" id="export-all">Tout exporter</button>' : ''}
          <a class="btn primary" href="#/nouvelle">+ Nouvelle classe</a>
        </div>
      </section>
      ${classes.length ? `<section class="class-grid">${classes.map(cardHTML).join('')}</section>` : `
        <section class="card empty">
          <div class="empty-board">TABLEAU</div>
          <h2>Aucune classe pour le moment</h2>
          <p class="muted">Commencez par créer votre première classe : disposition de la salle, puis élèves.</p>
          <a class="btn primary" href="#/nouvelle">+ Créer une classe</a>
        </section>`}
      <p class="muted small storage-note">Les classes sont enregistrées dans ce navigateur, sur cet ordinateur.
        Pensez à <strong>exporter</strong> une sauvegarde pour les conserver ou les utiliser sur un autre poste.</p>`;

    $('#import-backup').onclick = importBackup;
    if (classes.length) $('#export-all').onclick = () => downloadJSON(Model.exportData(classes), 'plans-de-classe.json');

    $$('.class-card').forEach(card => {
      const cls = classes.find(c => c.id === card.dataset.id);
      card.querySelector('[data-act="duplicate"]').onclick = async () => {
        const copy = structuredClone(cls);
        copy.id = uid();
        copy.name = `${cls.name} (copie)`;
        copy.createdAt = Date.now();
        await Model.save(copy);
        toast('Classe dupliquée.');
        render();
      };
      card.querySelector('[data-act="export"]').onclick = () =>
        downloadJSON(Model.exportData([cls]), `classe-${slugify(cls.name)}.json`);
      card.querySelector('[data-act="delete"]').onclick = async () => {
        if (!await confirmDialog(`Supprimer définitivement la classe « ${cls.name} » ?`, { ok: 'Supprimer', danger: true })) return;
        await DB.remove(cls.id);
        toast('Classe supprimée.');
        render();
      };
    });
  }

  async function importBackup() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    const list = data && (Array.isArray(data.classes) ? data.classes : data.columns ? [data] : null);
    if (!list || !list.length) { toast("Ce fichier n'est pas une sauvegarde de plan de classe."); return; }

    const existing = new Set((await DB.all()).map(c => c.id));
    for (const raw of list) {
      const cls = Model.normalize(raw);
      if (existing.has(cls.id)) {
        cls.id = uid();
        cls.name += ' (importée)';
      }
      await DB.put(cls);
    }
    toast(list.length > 1 ? `${list.length} classes importées.` : 'Classe importée.');
    render();
  }

  return { render };
})();
