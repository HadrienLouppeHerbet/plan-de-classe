'use strict';

/* Navigation entre les écrans (#/, #/nouvelle, #/classe/:id, #/classe/:id/modifier). */
const App = (() => {
  const routes = [
    [/^#?\/?$/, () => HomeView.render()],
    [/^#\/nouvelle$/, () => EditorView.render(null)],
    [/^#\/classe\/([^/]+)\/modifier$/, m => EditorView.render(decodeURIComponent(m[1]))],
    [/^#\/classe\/([^/]+)$/, m => PlanView.render(decodeURIComponent(m[1]))],
  ];

  let leaveGuard = null;
  let currentHash = location.hash;

  async function route() {
    const hash = location.hash || '#/';
    leaveGuard = null;
    currentHash = hash;
    $$('.modal-backdrop').forEach(m => m.remove());
    document.body.classList.remove('no-scroll');
    await Auth.ready();
    if (!Auth.isUnlocked()) {
      Auth.renderLogin(route);
      return;
    }
    document.body.classList.remove('locked');
    for (const [pattern, show] of routes) {
      const m = hash.match(pattern);
      if (!m) continue;
      window.scrollTo(0, 0);
      try {
        await show(m);
      } catch (err) {
        console.error(err);
        $('#app').innerHTML = `<div class="card"><h2>Une erreur est survenue</h2><p>${esc(err.message)}</p><a class="btn" href="#/">Retour à l'accueil</a></div>`;
      }
      return;
    }
    location.hash = '#/';
  }

  window.addEventListener('hashchange', async () => {
    if (leaveGuard && leaveGuard()) {
      const target = location.hash;
      history.replaceState(null, '', currentHash || '#/');
      const leave = await confirmDialog('Des modifications ne sont pas enregistrées. Quitter quand même ?',
        { ok: 'Quitter sans enregistrer', danger: true });
      if (!leave) return;
      leaveGuard = null;
      location.hash = target;
      return;
    }
    route();
  });

  window.addEventListener('beforeunload', e => {
    if (leaveGuard && leaveGuard()) e.preventDefault();
  });

  return {
    start: route,
    setLeaveGuard(fn) { leaveGuard = fn; },
    rememberHash() { currentHash = location.hash; },
  };
})();

$('#logout').onclick = Auth.logout;

// Frein basique contre la copie occasionnelle des photos (n'empêche pas les outils dev).
document.addEventListener('contextmenu', e => {
  if (e.target.closest('.photo, .photo-btn, .faces img, .bench-item img, .thumb')) e.preventDefault();
});

App.start();
