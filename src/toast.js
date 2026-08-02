// Notifications ponctuelles (pop-up haut droit, façon Claude), pour les confirmations de fin
// d'action (envoi Notion, sauvegarde de configuration) — la progression en cours (recherche,
// import en masse, génération IA) reste affichée en ligne près de son déclencheur, car elle est
// contextuelle à un formulaire en cours d'édition plutôt qu'une notification autonome.
//
// Accessibilité : chaque toast porte son propre role="status"/"alert" + aria-live, sans jamais
// déplacer le focus à l'apparition (WAI-ARIA Authoring Practices — un toast ne doit pas interrompre
// la saisie en cours) ; le bouton de fermeture reste atteignable au clavier (Tab) pour qui veut le
// fermer explicitement plutôt que d'attendre l'auto-effacement.
//
// Seuls les toasts "info" s'auto-effacent : succès/warning/erreur restent jusqu'à fermeture
// manuelle, car ce sont des confirmations qu'on veut pouvoir relire après coup (ex. plusieurs
// entrées traitées à la suite). Au-delà de MAX_TOASTS empilés, le plus ancien est retiré pour
// éviter d'envahir l'écran.
const AUTO_DISMISS_MS = { success: 0, info: 5000, warning: 0, error: 0 };
const MAX_TOASTS = 3;
const activeToasts = [];

export function showToast(message, type = 'info') {
  const root = document.getElementById('toast-container');
  if (!root || !message) return null;

  if (activeToasts.length >= MAX_TOASTS) {
    activeToasts.shift().dismiss();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Fermer la notification');
  closeBtn.textContent = '✕';

  let timer = null;
  const entry = { dismiss: null };
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.remove();
    const idx = activeToasts.indexOf(entry);
    if (idx !== -1) activeToasts.splice(idx, 1);
  };
  entry.dismiss = dismiss;
  closeBtn.addEventListener('click', dismiss);
  toast.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });

  toast.append(text, closeBtn);
  root.appendChild(toast);
  activeToasts.push(entry);

  const ms = AUTO_DISMISS_MS[type] ?? AUTO_DISMISS_MS.info;
  if (ms > 0) timer = setTimeout(dismiss, ms);

  return { dismiss };
}
