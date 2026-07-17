import { THEMES } from './themes.js';
import { validateIsbn } from './isbn.js';
import { fetchBnF, fetchOpenLibrary, fetchGoogle, fetchCover } from './fetchers.js';
import { callClaude } from './claude.js';
import { BIB_FIELDS, getActiveBibFields } from './champs.js';
import { getEnabledBibFields, setEnabledBibFields } from './config.js';

const MERGE_KEYS = ['titre', 'auteur', ...BIB_FIELDS.map(f => f.key)];

let _searchLog = [];
export function getSearchLog() { return _searchLog; }

let _lastIsbn = '';
export function getLastIsbn() { return _lastIsbn; }

function shortSource(s = '') {
  return s.replace('BnF ISBN-', 'BnF ').replace('OpenLibrary ISBN-', 'OL ')
          .replace('OpenLibrary', 'OL').replace('Google Books', 'Google').replace('OL Covers', 'OL');
}

export function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

export function setField(id, val) {
  const el = document.getElementById(id);
  el.value = val || '';
  el.classList.toggle('prefilled', !!(val && val.toString().trim()));
}

export function setFieldNotion(id, val) {
  const el = document.getElementById(id);
  el.value = val || '';
  el.classList.remove('prefilled', 'ai-filled');
  el.classList.toggle('notion-filled', !!(val && val.toString().trim()));
}

export function setLastIsbn(isbn) { _lastIsbn = isbn; }

export function initThemes() {
  document.getElementById('f-theme').innerHTML = '<option value="">— Thème —</option>' +
    Object.keys(THEMES).map(t=>`<option value="${t}">${t}</option>`).join('');
  document.getElementById('f-soustheme').innerHTML = '<option value="">— Sous-thème —</option>';
}

export function updateSousTheme() {
  const t = document.getElementById('f-theme').value;
  const sel = document.getElementById('f-soustheme');
  if (!t) {
    sel.innerHTML = '<option value="">— Sous-thème —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Sous-thème —</option>' +
    THEMES[t].map(s=>`<option value="${s}">${s}</option>`).join('');
}

export function toggleLu() {
  const statut = document.getElementById('f-statut').value;
  const lu = statut === 'Lu' || statut === 'Étude';
  const avecPriorite = statut === 'À lire' || statut === 'En cours';
  document.getElementById('datelu-block').classList.toggle('hidden', !lu);
  document.getElementById('note-block').classList.toggle('hidden', !lu);
  document.getElementById('priorite-block').classList.toggle('hidden', !avecPriorite);
}

export function toggleDevlog() {
  const d = document.getElementById('devlog');
  const opening = d.style.display === 'none';
  d.style.display = opening ? 'block' : 'none';
  d.setAttribute('aria-hidden', opening ? 'false' : 'true');
}

export function detectCollection(b) {
  const COLLECTION_KEYWORDS = [
    'pléiade', 'pleiade',
    'bouquins', 'quarto',
    'bibliothèque de la pléiade',
    'folio classique', 'folio plus classique',
    'classiques garnier', 'classiques de poche',
    'the library of america',
    'everyman', "penguin classics deluxe",
    'bibliothèque de la pléiade',
  ];
  const COLLECTION_PUBLISHERS = [
    'gallimard', 'robert laffont', 'flammarion',
  ];
  const EDITION_KEYWORDS = [
    'édition originale', 'première édition', 'edition originale',
    'tirage limité', 'numéroté', 'numerote',
  ];

  const col = (b.collection || '').toLowerCase();
  const edit = (b.editeur || '').toLowerCase();
  const titre = (b.titre || '').toLowerCase();
  const date = parseInt(b.dateed || '9999');

  for (const kw of COLLECTION_KEYWORDS) {
    if (col.includes(kw) || titre.includes(kw)) {
      return { detected: true, reason: `collection "${b.collection || kw}"` };
    }
  }
  for (const kw of EDITION_KEYWORDS) {
    if (col.includes(kw) || titre.includes(kw)) {
      return { detected: true, reason: kw };
    }
  }
  if (date < 1900 && COLLECTION_PUBLISHERS.some(p => edit.includes(p))) {
    return { detected: true, reason: `édition ancienne (${date})` };
  }

  return { detected: false, reason: '' };
}

export function fillForm(b) {
  // Effacer toutes les classes notion-filled résiduelles d'un éventuel chargement Notion précédent
  document.querySelectorAll('.notion-filled').forEach(el => el.classList.remove('notion-filled'));
  setField('f-titre', b.titre);
  setField('f-auteur', b.auteur);
  setField('f-isbn', b.isbn);
  for (const f of getActiveBibFields()) {
    if (f.isCover || !document.getElementById(f.id)) continue;
    setField(f.id, b[f.key]);
  }
  document.getElementById('f-datelu-mois').value = '';
  document.getElementById('f-datelu-annee').value = '';
  document.getElementById('f-fiche').value = '';
  document.getElementById('f-fiche').classList.remove('ai-filled');
  document.getElementById('f-theme').value = '';
  document.getElementById('f-theme').classList.remove('ai-filled');
  document.getElementById('f-soustheme').classList.remove('ai-filled');
  updateSousTheme();
  document.getElementById('f-statut').value = 'À lire';
  document.getElementById('f-priorite').value = '';
  document.getElementById('f-note').value = '';
  document.getElementById('f-etat').value = '';
  document.getElementById('f-comment').value = '';
  document.getElementById('f-citations').value = '';
  const themeStatus = document.getElementById('theme-ai-status');
  const ficheStatus = document.getElementById('fiche-ai-status');
  if (themeStatus) themeStatus.textContent = '';
  if (ficheStatus) ficheStatus.textContent = '';
  toggleLu();
  document.getElementById('found-title').textContent = b.titre || (b.isbn ? 'ISBN : ' + b.isbn : '');
  document.getElementById('source-badge').textContent = b.source ? `Source : ${b.source}` : 'Saisie manuelle';

  _searchLog = b.searchLog ?? [];

  const badgeFields = [['f-titre', 'titre'], ['f-auteur', 'auteur'],
    ...getActiveBibFields().filter(f => !f.isCover).map(f => [f.id, f.key])];
  for (const [fid, key] of badgeFields) {
    const badge = document.getElementById(fid)?.closest('.field')?.querySelector('.lbl-src:not(.lbl-src--ia)');
    if (badge) badge.textContent = b.fieldSources?.[key] ? shortSource(b.fieldSources[key]) : 'ISBN';
  }

  const img = document.getElementById('cover-img');
  const coverBadge = document.getElementById('cover-src-badge');
  const coverActive = getActiveBibFields().some(f => f.key === 'couverture');
  if (coverActive && b.couverture) {
    img.src = b.couverture; img.style.display = 'block'; img.classList.add('prefilled');
    if (coverBadge) coverBadge.textContent = shortSource(b.fieldSources?.couverture || '');
  } else {
    img.style.display = 'none'; img.classList.remove('prefilled');
  }

  const collectionHint = detectCollection(b);
  document.getElementById('f-collection').checked = collectionHint.detected;
  const hintEl = document.getElementById('collection-hint');
  hintEl.textContent = collectionHint.detected ? `✦ Coché automatiquement (${collectionHint.reason})` : '';

  document.getElementById('form-section').style.display = 'block';
  const outputSection = document.getElementById('output-section');
  if (outputSection) outputSection.style.display = 'none';
}

export function fillFormFromNotion(b) {
  // ── Champs bibliographiques ──
  setFieldNotion('f-titre', b.titre);
  setFieldNotion('f-auteur', b.auteur);
  setFieldNotion('f-isbn', b.isbn);
  for (const f of getActiveBibFields()) {
    if (f.isCover || !document.getElementById(f.id)) continue;
    setFieldNotion(f.id, b[f.key]);
  }

  // ── Champs lecture / statut ──
  const setSelNotion = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val || '';
    el.classList.remove('prefilled', 'ai-filled');
    el.classList.toggle('notion-filled', !!(val && val.trim()));
  };
  setSelNotion('f-statut', b.statut || 'À lire');
  setSelNotion('f-priorite', b.priorite);
  setSelNotion('f-note', b.note);
  setSelNotion('f-etat', b.etat);

  const moiEl = document.getElementById('f-datelu-mois');
  moiEl.value = b.datem || '';
  moiEl.classList.remove('prefilled');
  moiEl.classList.toggle('notion-filled', !!(b.datem));

  const anEl = document.getElementById('f-datelu-annee');
  anEl.value = b.datey || '';
  anEl.classList.remove('prefilled');
  anEl.classList.toggle('notion-filled', !!(b.datey));

  // ── Thème / Sous-thème ──
  const themeEl = document.getElementById('f-theme');
  themeEl.value = b.theme || '';
  themeEl.classList.remove('prefilled', 'ai-filled');
  themeEl.classList.toggle('notion-filled', !!(b.theme));
  updateSousTheme();
  const sousEl = document.getElementById('f-soustheme');
  sousEl.value = b.soustheme || '';
  sousEl.classList.remove('prefilled', 'ai-filled');
  sousEl.classList.toggle('notion-filled', !!(b.soustheme));

  // ── Champs texte libres ──
  setFieldNotion('f-fiche', b.fiche);
  setFieldNotion('f-citations', b.citations);
  setFieldNotion('f-comment', b.commentaire);

  // ── Checkbox collection ──
  document.getElementById('f-collection').checked = b.fcollection || false;

  // ── Réinitialisation UI accessoire ──
  const themeStatus = document.getElementById('theme-ai-status');
  const ficheStatus = document.getElementById('fiche-ai-status');
  if (themeStatus) themeStatus.textContent = '';
  if (ficheStatus) ficheStatus.textContent = '';

  toggleLu();

  // ── En-tête résultat ──
  document.getElementById('found-title').textContent = b.titre || (b.isbn ? 'ISBN : ' + b.isbn : '');
  document.getElementById('source-badge').textContent = 'Source : Notion';
  _searchLog = [];

  // ── Couverture ──
  const img = document.getElementById('cover-img');
  const coverBadge = document.getElementById('cover-src-badge');
  const coverActive = getActiveBibFields().some(f => f.key === 'couverture');
  if (coverActive && b.couverture) {
    img.src = b.couverture;
    img.style.display = 'block';
    img.classList.remove('prefilled');
    img.classList.add('notion-filled');
    if (coverBadge) coverBadge.textContent = 'Notion';
  } else {
    img.src = '';
    img.style.display = 'none';
    img.classList.remove('prefilled', 'notion-filled');
  }

  // ── Hint collection (informatif, sans écraser la valeur Notion) ──
  const collectionHint = detectCollection(b);
  document.getElementById('collection-hint').textContent =
    collectionHint.detected ? `✦ (${collectionHint.reason})` : '';

  document.getElementById('form-section').style.display = 'block';
  const outputSection = document.getElementById('output-section');
  if (outputSection) outputSection.style.display = 'none';

  document.getElementById('btn-send-notion').textContent = 'Mettre à jour dans Notion';
}

export async function lookup(isbnArg = '') {
  const raw = isbnArg.trim().replace(/[-\s]/g, '');
  if (!raw) return;
  if (!validateIsbn(raw)) {
    setStatus('⚠️ ISBN invalide — vérifie le numéro (chiffre de contrôle incorrect).');
    return;
  }
  _lastIsbn = raw;
  const btnLookup = document.getElementById('btn-lookup');
  if (btnLookup) btnLookup.disabled = true;
  setStatus('Recherche en cours…');
  document.getElementById('form-section').style.display = 'none';

  const engine = localStorage.getItem('search_engine') || 'bnf';
  const activeKeys = new Set(getActiveBibFields().map(f => f.key));
  const b = { isbn: raw, source: '' };
  for (const key of MERGE_KEYS) b[key] = '';

  const all = [fetchBnF, fetchOpenLibrary, fetchGoogle];
  const preferred = { bnf: fetchBnF, openlibrary: fetchOpenLibrary, google: fetchGoogle };
  const first = preferred[engine] || fetchBnF;
  const rest = all.filter(f => f !== first);
  const fetchers = [first, ...rest];

  const fetcherNames = new Map([
    [fetchBnF, 'BnF'], [fetchOpenLibrary, 'OpenLibrary'], [fetchGoogle, 'Google Books'],
  ]);
  b.searchLog = [];
  b.fieldSources = {};
  const sources = [];
  const criticalFields = ['titre', 'auteur', 'editeur', 'pages'].filter(f => f === 'titre' || f === 'auteur' || activeKeys.has(f));

  for (let i = 0; i < fetchers.length; i++) {
    const fetcher = fetchers[i];
    if (criticalFields.every(f => b[f])) {
      for (const f of fetchers.slice(i)) {
        b.searchLog.push({ source: fetcherNames.get(f), status: 'non_consulté', fields: [] });
      }
      break;
    }
    const tmp = { isbn: raw, source: '' };
    for (const key of MERGE_KEYS) tmp[key] = '';
    let logStatus = 'non_trouvé';
    try {
      await fetcher(raw, tmp);
      logStatus = tmp.source ? 'trouvé' : 'non_trouvé';
    } catch {
      logStatus = 'erreur';
    }
    const contributed = [];
    if (tmp.source) {
      for (const key of MERGE_KEYS) {
        if (key !== 'titre' && key !== 'auteur' && !activeKeys.has(key)) continue;
        if (!b[key] && tmp[key]) { b[key] = tmp[key]; b.fieldSources[key] = tmp.source; contributed.push(key); }
      }
    }
    b.searchLog.push({
      source: tmp.source || fetcherNames.get(fetcher),
      status: contributed.length > 0 ? 'importé' : logStatus,
      fields: contributed,
    });
    if (contributed.length && tmp.source) sources.push(tmp.source);
  }
  b.source = sources.join(' • ');

  setStatus(b.titre ? '' : 'ISBN introuvable — remplis manuellement.');

  if (activeKeys.has('couverture') && !b.couverture) {
    const cover = await fetchCover(raw);
    if (cover) { b.couverture = cover; b.fieldSources.couverture = 'OL Covers'; }
  }
  const coversContributed = b.fieldSources.couverture ? ['couverture'] : [];
  b.searchLog.push({
    source: 'OL Covers',
    status: coversContributed.length ? 'importé' : 'non_trouvé',
    fields: coversContributed,
  });

  fillForm(b);
}

export async function suggestTheme() {
  const titre  = document.getElementById('f-titre').value.trim();
  const auteur = document.getElementById('f-auteur').value.trim();
  if (!titre && !auteur) {
    document.getElementById('theme-ai-status').textContent = '⚠️ Renseigne d\'abord le titre et/ou l\'auteur.';
    return;
  }
  const btn = document.getElementById('btn-suggest-theme');
  const status = document.getElementById('theme-ai-status');
  btn.disabled = true;
  status.textContent = '✦ Analyse en cours…';

  const sousThemes = Object.entries(THEMES).map(([t, ss]) => `${t} : ${ss.join(', ')}`).join('\n');
  const prompt = `Tu es un bibliothécaire expert. Pour le livre "${titre}" de ${auteur || 'auteur inconnu'}, choisis le thème et le sous-thème les plus appropriés parmi ces options exactes :

${sousThemes}

Réponds UNIQUEMENT avec ce format JSON, sans texte autour :
{"theme": "...", "sousTheme": "..."}`;

  try {
    const raw = await callClaude(prompt);
    const json = JSON.parse(raw.match(/\{.*\}/s)?.[0] || raw);
    const theme = json.theme || '';
    const sousTheme = json.sousTheme || '';

    if (theme && THEMES[theme]) {
      document.getElementById('f-theme').value = theme;
      updateSousTheme();
      if (sousTheme && THEMES[theme].includes(sousTheme)) {
        document.getElementById('f-soustheme').value = sousTheme;
      }
      document.getElementById('f-theme').classList.remove('notion-filled');
      document.getElementById('f-theme').classList.add('ai-filled');
      document.getElementById('f-soustheme').classList.remove('notion-filled');
      document.getElementById('f-soustheme').classList.add('ai-filled');
      status.textContent = `✓ Suggestion : ${theme}${sousTheme ? ' › ' + sousTheme : ''}`;
    } else {
      status.textContent = '⚠️ Suggestion hors liste — vérifie manuellement.';
    }
  } catch(e) {
    status.textContent = '🔴 ' + e.message;
  }
  btn.disabled = false;
}

function statusLabel(s) {
  return { importé: 'Importé', trouvé: 'Trouvé', non_trouvé: 'Aucun résultat', erreur: 'Erreur réseau', non_consulté: 'Non consulté' }[s] || s;
}

export function toggleSourcePopover() {
  const pop = document.getElementById('source-popover');
  if (!pop) return;
  if (!pop.hidden) { pop.hidden = true; return; }

  const LABELS = { titre: 'Titre', auteur: 'Auteur', editeur: 'Éditeur', collection: 'Collection', dateed: 'Date éd.', pages: 'Pages', couverture: 'Couverture', categories: 'Genre', description: 'Résumé', language: 'Langue' };
  const STATUS_META = {
    importé:      { icon: '✓', cls: 'sp-ok' },
    trouvé:       { icon: '◦', cls: 'sp-found' },
    non_trouvé:   { icon: '—', cls: 'sp-none' },
    erreur:       { icon: '✗', cls: 'sp-err' },
    non_consulté: { icon: '·', cls: 'sp-skip' },
  };
  pop.innerHTML = _searchLog.map(({ source, status, fields }) => {
    const { icon, cls } = STATUS_META[status] || STATUS_META.non_trouvé;
    const detail = fields.length ? fields.map(f => LABELS[f] || f).join(', ') : statusLabel(status);
    return `<div class="sp-row"><span class="sp-src">${source}</span><span class="sp-status ${cls}">${icon} ${detail}</span></div>`;
  }).join('');
  pop.hidden = false;
}

export async function generateFiche() {
  const titre      = document.getElementById('f-titre').value.trim();
  const auteur     = document.getElementById('f-auteur').value.trim();
  const editeur    = document.getElementById('f-editeur')?.value?.trim() || '';
  const collection = document.getElementById('f-collection-ed')?.value?.trim() || '';
  if (!titre) {
    document.getElementById('fiche-ai-status').textContent = '⚠️ Renseigne d\'abord le titre.';
    return;
  }
  const btn = document.getElementById('btn-generate-fiche');
  const status = document.getElementById('fiche-ai-status');
  btn.disabled = true;
  status.textContent = '✦ Génération en cours…';

  const theme     = document.getElementById('f-theme').value.trim();
  const sousTheme = document.getElementById('f-soustheme').value.trim();
  const themeCtx  = [theme, sousTheme].filter(Boolean).join(' › ');

  const prompt = `Fiche de lecture pour "${titre}"${auteur ? ' de ' + auteur : ''}${editeur ? ' — éd. ' + editeur : ''}${collection ? ' (' + collection + ')' : ''}${themeCtx ? ' — ' + themeCtx : ''}.

Réponds en exactement 3 points courts, une ligne chacun, format :
• [propos ou intrigue centrale — une phrase]
• [idées, enjeux ou événements clés — une phrase]
• [ce qui rend ce livre singulier ou mémorable — une phrase]

Règles : pas de titre, pas d'introduction, pas de jugement stylistique. Adapte-toi au type d'œuvre (roman, essai, poésie, traité, etc.). En français.
Commence ta réponse par "#Générée automatiquement par IA" puis une ligne vide, puis les 3 points.`;

  try {
    const fiche = await callClaude(prompt, { model: 'claude-sonnet-4-6', maxTokens: 600 });
    const ficheEl = document.getElementById('f-fiche');
    ficheEl.value = fiche.trim();
    ficheEl.classList.remove('notion-filled');
    ficheEl.classList.add('ai-filled');
    status.textContent = '✓ Fiche générée — vérifie et modifie si nécessaire.';
  } catch(e) {
    status.textContent = '🔴 ' + e.message;
  }
  btn.disabled = false;
}

// Complète les champs vides du formulaire via les sources bibliographiques sans toucher
// aux champs déjà remplis (notamment ceux venus de Notion).
export async function complementFromSources(isbn) {
  const engine = localStorage.getItem('search_engine') || 'bnf';
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const activeKeys = new Set(getActiveBibFields().map(f => f.key));
  const idMap = { titre: 'f-titre', auteur: 'f-auteur',
    ...Object.fromEntries(BIB_FIELDS.filter(f => !f.isCover).map(f => [f.key, f.id])) };
  const current = Object.fromEntries(MERGE_KEYS.map(key => [key, idMap[key] ? get(idMap[key]) : '']));
  const criticalFields = ['titre', 'auteur', 'editeur', 'pages'].filter(f => f === 'titre' || f === 'auteur' || activeKeys.has(f));
  const hasCover = () => {
    const img = document.getElementById('cover-img');
    return img && img.style.display !== 'none' && !!img.src;
  };

  const all = [fetchBnF, fetchOpenLibrary, fetchGoogle];
  const preferred = { bnf: fetchBnF, openlibrary: fetchOpenLibrary, google: fetchGoogle };
  const first = preferred[engine] || fetchBnF;
  const fetchers = [first, ...all.filter(f => f !== first)];

  let anyFilled = false;

  for (const fetcher of fetchers) {
    if (criticalFields.every(f => current[f])) break;
    const tmp = { isbn, source: '' };
    for (const key of MERGE_KEYS) tmp[key] = '';
    try { await fetcher(isbn, tmp); } catch { continue; }
    if (!tmp.source) continue;
    for (const key of MERGE_KEYS) {
      if (key !== 'titre' && key !== 'auteur' && !activeKeys.has(key)) continue;
      if (!idMap[key]) continue;
      if (!current[key] && tmp[key]) {
        setField(idMap[key], tmp[key]);
        current[key] = tmp[key];
        anyFilled = true;
      }
    }
  }

  if (activeKeys.has('couverture') && !hasCover()) {
    const cover = await fetchCover(isbn);
    if (cover) {
      const img = document.getElementById('cover-img');
      const coverBadge = document.getElementById('cover-src-badge');
      img.src = cover;
      img.style.display = 'block';
      img.classList.add('prefilled');
      if (coverBadge) coverBadge.textContent = 'OL';
      anyFilled = true;
    }
  }

  return anyFilled;
}

// Construit la grille des champs bibliographiques configurables (hors Titre/Auteur/ISBN,
// toujours statiques, et hors Couverture, gérée par le bloc image dédié).
export function renderBibFieldsCard() {
  const container = document.getElementById('bib-fields-dynamic');
  if (!container) return;
  const fields = getActiveBibFields().filter(f => !f.isCover);

  container.innerHTML = fields.map(f => {
    const isTextarea = f.key === 'description';
    const fullClass = isTextarea ? ' full' : '';
    const placeholder = f.key === 'categories' ? ' placeholder="ex. Roman, Philosophie"' : f.key === 'dateed' ? ' placeholder="ex. 2025"' : '';
    const control = isTextarea
      ? `<textarea id="${f.id}" rows="3"></textarea>`
      : `<input type="text" id="${f.id}"${placeholder}>`;
    return `<div class="field${fullClass}"><label for="${f.id}">${f.label} <span class="lbl-src">ISBN</span><span class="lbl-src lbl-src--notion">Notion</span></label>${control}</div>`;
  }).join('');

  for (const f of fields) {
    document.getElementById(f.id)?.addEventListener('input', function() {
      this.classList.remove('prefilled', 'notion-filled');
    });
  }
}

// Peuple les cases à cocher du panneau « Champs bibliographiques » depuis la config active.
export function renderBibFieldsChecklist() {
  const container = document.getElementById('bib-fields-checklist');
  if (!container) return;
  const enabled = new Set(getEnabledBibFields() ?? BIB_FIELDS.filter(f => f.defaultOn).map(f => f.key));
  container.innerHTML = BIB_FIELDS.map(f => `<div class="field checkbox-row"><input type="checkbox" id="bibcfg-${f.key}"${enabled.has(f.key) ? ' checked' : ''}><label for="bibcfg-${f.key}">${f.label}</label></div>`).join('');
}

// Lit les cases cochées, enregistre la config et reconstruit immédiatement la fiche bibliographique.
export function saveBibFieldsConfig() {
  const keys = BIB_FIELDS.filter(f => document.getElementById(`bibcfg-${f.key}`)?.checked).map(f => f.key);
  setEnabledBibFields(keys);
  renderBibFieldsCard();
  const status = document.getElementById('bib-fields-status');
  if (status) {
    status.textContent = '✅ Champs mis à jour.';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
}

export function toggleBibFieldsPanel() {
  const p = document.getElementById('bib-config-panel');
  if (!p) return;
  const visible = p.style.display !== 'none';
  p.style.display = visible ? 'none' : 'block';
  p.setAttribute('aria-hidden', visible ? 'true' : 'false');
  if (!visible) {
    renderBibFieldsChecklist();
    const status = document.getElementById('bib-fields-status');
    if (status) status.textContent = '';
  }
}
