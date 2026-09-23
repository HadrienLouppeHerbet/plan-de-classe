'use strict';

/*
 * Écran de connexion — authentification Supabase (un compte par membre du personnel).
 * La session est gérée par le SDK Supabase : jeton stocké et rafraîchi automatiquement.
 * Les comptes se créent depuis le tableau de bord Supabase (Authentication → Users), pas
 * d'auto-inscription publique.
 */
const Auth = (() => {
  let session = null;
  let readyResolve;
  const readyPromise = new Promise(r => { readyResolve = r; });

  Supa.auth.getSession().then(({ data }) => {
    session = data.session;
    readyResolve();
  });
  Supa.auth.onAuthStateChange((_event, s) => { session = s; });

  function ready() { return readyPromise; }
  function isUnlocked() { return !!session; }

  function renderLogin(onSuccess) {
    document.body.classList.add('locked');
    $('#app').innerHTML = `
      <section class="login card">
        <div class="empty-board">TABLEAU</div>
        <h1>Plan de classe</h1>
        <p class="muted">Connectez-vous avec votre compte de l'établissement.</p>
        <form id="login-form" autocomplete="on">
          <input type="email" id="login-email" class="wide" placeholder="Adresse e-mail" aria-label="Adresse e-mail" required autocomplete="username">
          <input type="password" id="login-password" class="wide" placeholder="Mot de passe" aria-label="Mot de passe" required autocomplete="current-password">
          <button class="btn primary" type="submit">Se connecter</button>
        </form>
        <p class="login-error" id="login-error" role="alert"></p>
      </section>`;

    const form = $('#login-form'), email = $('#login-email'), password = $('#login-password'), error = $('#login-error');
    email.focus();
    form.onsubmit = async e => {
      e.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      error.textContent = '';
      const { data, error: err } = await Supa.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (!err && data.session) {
        session = data.session;
        document.body.classList.remove('locked');
        onSuccess();
        return;
      }
      await new Promise(r => setTimeout(r, 800)); // freine les essais en série
      error.textContent = 'Adresse e-mail ou mot de passe incorrect.';
      password.value = '';
      password.focus();
      button.disabled = false;
    };
  }

  async function logout() {
    await Supa.auth.signOut();
    session = null;
    location.hash = '#/';
    location.reload();
  }

  return { isUnlocked, renderLogin, logout, ready };
})();
