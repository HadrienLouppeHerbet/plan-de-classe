'use strict';

/*
 * Écran de connexion.
 * Le mot de passe n'est pas écrit ici : seule son empreinte PBKDF2 (SHA-256) est conservée.
 * Attention : sans serveur, ce contrôle protège l'accès à l'interface mais peut être
 * contourné par quelqu'un qui modifie le code de la page.
 *
 * Pour changer le mot de passe, générer une nouvelle empreinte, par exemple avec Python :
 *   import hashlib, os; s = os.urandom(16)
 *   print(s.hex(), hashlib.pbkdf2_hmac('sha256', 'NOUVEAU'.encode(), s, 210000).hex())
 * puis remplacer SALT et HASH ci-dessous.
 */
const Auth = (() => {
  const SALT = '75eaa86d45085413ab002a2d42fd5cc7';
  const HASH = '8c3ea472b255b5af2f4a640cbd840a351537a5deb5d2620fa06752bff891fd1a';
  const ITERATIONS = 210000;
  const SESSION_KEY = 'plan-de-classe-session';

  const hexToBytes = hex => new Uint8Array(hex.match(/../g).map(b => parseInt(b, 16)));
  const bytesToHex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

  async function check(password) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(SALT), iterations: ITERATIONS }, key, 256);
    return bytesToHex(bits) === HASH;
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === HASH; } catch { return false; }
  }

  function setUnlocked(on) {
    try {
      if (on) sessionStorage.setItem(SESSION_KEY, HASH);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* stockage indisponible : il faudra se reconnecter à chaque chargement */ }
    document.body.classList.toggle('locked', !on);
  }

  function renderLogin(onSuccess) {
    document.body.classList.add('locked');
    $('#app').innerHTML = `
      <section class="login card">
        <div class="empty-board">TABLEAU</div>
        <h1>Plan de classe</h1>
        <p class="muted">Saisissez le mot de passe pour accéder à l'application.</p>
        <form id="login-form" autocomplete="off">
          <input type="password" id="login-password" class="wide" placeholder="Mot de passe" aria-label="Mot de passe" required>
          <button class="btn primary" type="submit">Se connecter</button>
        </form>
        <p class="login-error" id="login-error" role="alert"></p>
      </section>`;

    const form = $('#login-form'), input = $('#login-password'), error = $('#login-error');
    input.focus();
    if (!window.crypto || !crypto.subtle) {
      error.textContent = "Ce navigateur ne permet pas la vérification du mot de passe. Utilisez une version récente de Chrome, Edge ou Firefox.";
      form.querySelector('button').disabled = true;
      return;
    }
    form.onsubmit = async e => {
      e.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      error.textContent = '';
      const ok = await check(input.value);
      if (ok) {
        setUnlocked(true);
        onSuccess();
        return;
      }
      await new Promise(r => setTimeout(r, 800)); // freine les essais en série
      error.textContent = 'Mot de passe incorrect.';
      input.value = '';
      input.focus();
      button.disabled = false;
    };
  }

  function logout() {
    setUnlocked(false);
    location.hash = '#/';
    location.reload();
  }

  return { isUnlocked, renderLogin, logout };
})();
