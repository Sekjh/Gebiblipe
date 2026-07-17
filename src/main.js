import { initThemes, lookup, updateSousTheme, toggleLu, toggleDevlog, suggestTheme, generateFiche, toggleSourcePopover, getLastIsbn, setLastIsbn, fillFormFromNotion, setStatus, complementFromSources, renderBibFieldsCard, toggleBibFieldsPanel, saveBibFieldsConfig } from './ui.js';
import { sendToNotion, saveConfig, toggleConfig, lookupFromNotion, setCurrentPageId, clearCurrentPageId, getCurrentPageId, updateConfigWarning } from './notion.js';
import { validateIsbn } from './isbn.js';
import { getConfig } from './config.js';

// Populate year select (1980 → current year)
const sel = document.getElementById('f-datelu-annee');
const now = new Date().getFullYear();
for (let y = now; y >= 1980; y--) {
  const opt = document.createElement('option');
  opt.value = y; opt.textContent = y;
  sel.appendChild(opt);
}

initThemes();
updateConfigWarning();
renderBibFieldsCard();

// ── Pré-vérification Notion puis recherche ─────────────────────────────────
async function startSearch(isbn) {
  const raw = isbn.trim().replace(/[-\s]/g, '');
  if (!raw) return;
  if (!validateIsbn(raw)) {
    setStatus('⚠️ ISBN invalide — vérifie le numéro (chiffre de contrôle incorrect).');
    return;
  }
  setLastIsbn(raw);
  document.getElementById('btn-lookup').disabled = true;
  setStatus('🔄 Vérification dans Notion…');

  const cfg = getConfig();
  const notionResult = await lookupFromNotion(raw, cfg);

  if (notionResult.found) {
    showNotionChoice(notionResult, raw);
  } else {
    clearCurrentPageId();
    document.getElementById('btn-send-notion').textContent = 'Envoyer dans Notion';
    await lookup(raw);
  }
}

function showNotionChoice(result, isbn) {
  const statusEl = document.getElementById('status');
  statusEl.innerHTML = '';
  statusEl.style.whiteSpace = 'normal';

  const msg = document.createElement('span');
  msg.textContent = `📚 "${result.book.titre || isbn}" trouvé dans ta bibliothèque Notion.`;
  statusEl.appendChild(msg);
  statusEl.appendChild(document.createElement('br'));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';

  const btnNotion = document.createElement('button');
  btnNotion.textContent = 'Charger depuis Notion';
  btnNotion.style.cssText = 'height:34px;font-size:13px;background:var(--text);color:var(--bg);border:none;border-radius:var(--radius);padding:0 1rem;cursor:pointer;width:auto;';
  btnNotion.addEventListener('click', () => {
    setCurrentPageId(result.pageId);
    fillFormFromNotion(result.book);

    // Proposer de compléter les champs vides via les sources bibliographiques
    statusEl.innerHTML = '';
    statusEl.style.whiteSpace = '';
    const btnComplement = document.createElement('button');
    btnComplement.textContent = 'Compléter les champs avec les sources bibliothéquaires';
    btnComplement.style.cssText = 'height:34px;font-size:12px;background:none;color:var(--muted);border:1px solid var(--border);border-radius:var(--radius);padding:0 1rem;cursor:pointer;width:auto;margin-top:2px;';
    btnComplement.addEventListener('click', async () => {
      btnComplement.disabled = true;
      btnComplement.textContent = '🔄 Recherche en cours…';
      const anyFilled = await complementFromSources(isbn);
      if (anyFilled) {
        statusEl.textContent = '✓ Champs vides complétés depuis les sources.';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      } else {
        statusEl.textContent = '';
      }
    });
    statusEl.appendChild(btnComplement);
  });

  const btnAdd = document.createElement('button');
  btnAdd.textContent = 'Ajouter une nouvelle entrée';
  btnAdd.style.cssText = 'height:34px;font-size:13px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:0 1rem;cursor:pointer;width:auto;';
  btnAdd.addEventListener('click', async () => {
    clearCurrentPageId();
    document.getElementById('btn-send-notion').textContent = 'Envoyer dans Notion';
    statusEl.textContent = '';
    statusEl.style.whiteSpace = '';
    await lookup(isbn);
  });

  btnRow.appendChild(btnNotion);
  btnRow.appendChild(btnAdd);
  statusEl.appendChild(btnRow);
  btnNotion.focus();

  document.getElementById('btn-lookup').disabled = false;
}

function showDuplicateOnSendChoice(result) {
  const notionStatus = document.getElementById('notion-status');
  notionStatus.innerHTML = '';

  const msg = document.createElement('span');
  msg.textContent = `⚠️ "${result.book.titre || 'Cette entrée'}" existe déjà dans ta bibliothèque Notion.`;
  notionStatus.appendChild(msg);
  notionStatus.appendChild(document.createElement('br'));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';

  const btnUpdate = document.createElement('button');
  btnUpdate.textContent = 'Mettre à jour la fiche existante';
  btnUpdate.style.cssText = 'height:34px;font-size:13px;background:var(--text);color:var(--bg);border:none;border-radius:var(--radius);padding:0 1rem;cursor:pointer;width:auto;';
  btnUpdate.addEventListener('click', () => {
    setCurrentPageId(result.pageId);
    notionStatus.innerHTML = '';
    sendToNotion();
  });

  const btnCreate = document.createElement('button');
  btnCreate.textContent = 'Créer une nouvelle entrée';
  btnCreate.style.cssText = 'height:34px;font-size:13px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:0 1rem;cursor:pointer;width:auto;';
  btnCreate.addEventListener('click', () => {
    clearCurrentPageId();
    notionStatus.innerHTML = '';
    sendToNotion();
  });

  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Annuler';
  btnCancel.style.cssText = 'height:34px;font-size:13px;background:none;color:var(--muted);border:1px solid var(--border);border-radius:var(--radius);padding:0 1rem;cursor:pointer;width:auto;';
  btnCancel.addEventListener('click', () => { notionStatus.textContent = ''; });

  btnRow.append(btnUpdate, btnCreate, btnCancel);
  notionStatus.appendChild(btnRow);
  btnUpdate.focus();
}

// ── ISBN input ──────────────────────────────────────────────────────────────
const isbnInput = document.getElementById('isbn-input');
const btnLookup = document.getElementById('btn-lookup');
isbnInput.addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9Xx-]/g, '');
  const normalized = this.value.trim().replace(/[-\s]/g, '');
  btnLookup.disabled = normalized !== '' && normalized === getLastIsbn();
});
isbnInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') startSearch(isbnInput.value.trim());
});
btnLookup.addEventListener('click', () => startSearch(isbnInput.value.trim()));

// Cmd/Ctrl+Enter anywhere in the form sends to Notion
document.getElementById('form-section').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    sendToNotion();
  }
});

// Retrait des badges quand l'utilisateur modifie un champ auto-rempli
// (les champs bibliographiques configurables ont leur propre listener, attaché
// dynamiquement par renderBibFieldsCard() dans ui.js à chaque (re)génération de la grille)
for (const id of ['f-titre', 'f-auteur']) {
  document.getElementById(id).addEventListener('input', function() {
    this.classList.remove('prefilled', 'notion-filled');
  });
}
for (const id of ['f-citations', 'f-comment']) {
  document.getElementById(id).addEventListener('input', function() { this.classList.remove('notion-filled'); });
}
for (const id of ['f-priorite', 'f-note', 'f-etat', 'f-datelu-mois', 'f-datelu-annee']) {
  document.getElementById(id).addEventListener('change', function() { this.classList.remove('notion-filled'); });
}
document.getElementById('f-fiche').addEventListener('input', function() {
  this.classList.remove('ai-filled', 'notion-filled');
});
document.getElementById('f-soustheme').addEventListener('change', function() {
  this.classList.remove('ai-filled', 'notion-filled');
});

// Classification
document.getElementById('f-theme').addEventListener('change', () => {
  updateSousTheme();
  document.getElementById('f-theme').classList.remove('ai-filled', 'notion-filled');
  document.getElementById('f-soustheme').classList.remove('ai-filled', 'notion-filled');
});
document.getElementById('btn-suggest-theme').addEventListener('click', suggestTheme);

// Statut & lecture
document.getElementById('f-statut').addEventListener('change', function() {
  this.classList.remove('notion-filled');
  toggleLu();
});

// Fiche de lecture
document.getElementById('btn-generate-fiche').addEventListener('click', generateFiche);
document.getElementById('btn-clear-fiche').addEventListener('click', () => {
  const fiche = document.getElementById('f-fiche');
  fiche.value = '';
  fiche.classList.remove('ai-filled', 'notion-filled');
});

// Envoi Notion
document.getElementById('btn-send-notion').addEventListener('click', async () => {
  const isbn = document.getElementById('f-isbn')?.value?.trim().replace(/[-\s]/g, '');
  if (!getCurrentPageId() && isbn) {
    const cfg = getConfig();
    if (cfg.token && cfg.dbId) {
      document.getElementById('notion-status').textContent = '🔄 Vérification des doublons…';
      const result = await lookupFromNotion(isbn, cfg);
      if (result.found) {
        showDuplicateOnSendChoice(result);
        return;
      }
      document.getElementById('notion-status').textContent = '';
    }
  }
  sendToNotion();
});

// Source popover
document.getElementById('source-badge').addEventListener('click', toggleSourcePopover);
document.addEventListener('click', e => {
  if (!e.target.closest('#source-badge') && !e.target.closest('#source-popover'))
    document.getElementById('source-popover').hidden = true;
});

// Barre de navigation bas de page — un seul panneau visible à la fois
function hideOtherPanels(exceptId) {
  for (const id of ['doc-panel', 'devlog', 'config-panel', 'bib-config-panel']) {
    if (id === exceptId) continue;
    const el = document.getElementById(id);
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
  }
}

document.getElementById('btn-toggle-devlog').addEventListener('click', () => {
  hideOtherPanels('devlog');
  toggleDevlog();
});
document.getElementById('btn-toggle-config').addEventListener('click', () => {
  hideOtherPanels('config-panel');
  toggleConfig();
});
document.getElementById('btn-toggle-bib-fields').addEventListener('click', () => {
  hideOtherPanels('bib-config-panel');
  toggleBibFieldsPanel();
});
document.getElementById('btn-close-devlog').addEventListener('click', toggleDevlog);

function toggleDoc() {
  const panel = document.getElementById('doc-panel');
  const isVisible = panel.style.display !== 'none';
  hideOtherPanels('doc-panel');
  panel.style.display = isVisible ? 'none' : 'block';
  panel.setAttribute('aria-hidden', isVisible ? 'true' : 'false');
}
document.getElementById('btn-toggle-doc').addEventListener('click', toggleDoc);
document.getElementById('btn-close-doc').addEventListener('click', toggleDoc);

// Config panel
document.getElementById('btn-save-config').addEventListener('click', saveConfig);

// Champs bibliographiques
document.getElementById('btn-save-bib-fields').addEventListener('click', saveBibFieldsConfig);

// iOS Shortcuts — auto-lookup si ?isbn= dans l'URL
const params = new URLSearchParams(window.location.search);
const isbnParam = params.get('isbn');
if (isbnParam) {
  setTimeout(() => startSearch(isbnParam.replace(/[^0-9Xx]/g, '')), 300);
}
