import { THEMES } from './themes.js';
import { validateIsbn } from './isbn.js';
import { fetchCover, resolveFromSources } from './fetchers.js';
import { callClaude } from './claude.js';
import { MANDATORY_FIELDS, BIB_FIELDS, PIVOT_FIELDS, MERGE_KEYS, getActiveBibFields } from './champs.js';
import { getEnabledBibFields, setEnabledBibFields } from './config.js';

let _searchLog = [];
export function getSearchLog() { return _searchLog; }

let _sourceIds = {};
export function getSourceIds() { return _sourceIds; }

// Vrai quand la fiche courante n'a été alimentée par aucune source bibliographique
// (bouton "Nouveau sans ISBN", ou recherche ISBN dont aucune des 4 sources n'a rien
// trouvé) — envoyé à Notion comme case à cocher technique (voir buildProps() dans
// notion.js), à l'instar des identifiants pivots (ARK, OLID…).
let _manualEntry = false;
export function isManualEntry() { return _manualEntry; }

let _lastIsbn = '';
export function getLastIsbn() { return _lastIsbn; }

function shortSource(s = '') {
  return s.replace('BnF ISBN-', 'BnF ').replace('OpenLibrary ISBN-', 'OL ')
          .replace('SUDOC ISBN-', 'SUDOC ')
          .replace('OpenLibrary', 'OL').replace('Google Books', 'Google').replace('OL Covers', 'OL');
}

// Classes de couleur par source réelle (BnF/Google/OpenLibrary/SUDOC), distinctes de la
// palette catégorie existante (.lbl-src--ia/.lbl-src--notion). La couleur reste un renfort
// visuel : le texte du badge (shortSource) demeure la source d'information primaire (RGAA
// critère 3.1 — ne jamais coder l'information uniquement par la couleur).
const SOURCE_COLOR_CLASSES = ['lbl-src--bnf', 'lbl-src--google', 'lbl-src--openlibrary', 'lbl-src--sudoc'];
function sourceColorClass(source = '') {
  const s = source.toLowerCase();
  if (s.startsWith('bnf'))        return 'lbl-src--bnf';
  if (s.startsWith('sudoc'))      return 'lbl-src--sudoc';
  if (s.startsWith('google'))     return 'lbl-src--google';
  if (s.startsWith('openlibrary') || s.startsWith('ol ')) return 'lbl-src--openlibrary';
  return '';
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
  const notionActions = document.getElementById('notion-actions');
  if (notionActions) notionActions.innerHTML = '';

  _searchLog = b.searchLog ?? [];
  _sourceIds = b.sourceIds ?? {};
  _manualEntry = !b.source;

  const badgeFields = [['f-titre', 'titre'], ['f-auteur', 'auteur'],
    ...getActiveBibFields().filter(f => !f.isCover).map(f => [f.id, f.key])];
  for (const [fid, key] of badgeFields) {
    const badge = document.getElementById(fid)?.closest('.field')?.querySelector('.lbl-src:not(.lbl-src--ia)');
    if (badge) {
      badge.textContent = b.fieldSources?.[key] ? shortSource(b.fieldSources[key]) : 'ISBN';
      badge.classList.remove(...SOURCE_COLOR_CLASSES);
      const colorClass = sourceColorClass(b.fieldSources?.[key] || '');
      if (colorClass) badge.classList.add(colorClass);
    }
  }

  const img = document.getElementById('cover-img');
  const coverBadge = document.getElementById('cover-src-badge');
  const coverActive = getActiveBibFields().some(f => f.key === 'couverture');
  if (coverActive && b.couverture) {
    img.src = b.couverture; img.style.display = 'block'; img.classList.add('prefilled');
    if (coverBadge) {
      coverBadge.textContent = shortSource(b.fieldSources?.couverture || '');
      coverBadge.classList.remove(...SOURCE_COLOR_CLASSES);
      const colorClass = sourceColorClass(b.fieldSources?.couverture || '');
      if (colorClass) coverBadge.classList.add(colorClass);
    }
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
  _sourceIds = {};
  _manualEntry = false;

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
  const empty = { isbn: raw, source: '' };
  for (const key of MERGE_KEYS) empty[key] = '';

  const { book: b, searchLog } = await resolveFromSources(raw, empty, activeKeys, engine, { stopWhenComplete: true });
  b.searchLog = searchLog;

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

// Ouvre le formulaire vide et éditable pour un livre sans ISBN (ouvrages anciens, manuscrits,
// tirages spéciaux…). fillForm() gère déjà b.source vide via le fallback "Saisie manuelle"
// (voir source-badge ci-dessus) — aucune identifiant local n'est généré : la page Notion créée
// à l'envoi reste la seule clé, la dédup par ISBN étant déjà sautée quand l'ISBN est vide.
export function startManualEntry() {
  const b = { isbn: '', source: '', searchLog: [], fieldSources: {}, sourceIds: {} };
  for (const key of MERGE_KEYS) b[key] = '';
  fillForm(b);
  setStatus('');
  document.getElementById('f-titre')?.focus();
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

  const LABELS = Object.fromEntries([...MANDATORY_FIELDS, ...BIB_FIELDS].map(f => [f.key, f.label]));
  const STATUS_META = {
    importé:      { icon: '✓', cls: 'sp-ok' },
    trouvé:       { icon: '◦', cls: 'sp-found' },
    non_trouvé:   { icon: '—', cls: 'sp-none' },
    erreur:       { icon: '✗', cls: 'sp-err' },
    non_consulté: { icon: '·', cls: 'sp-skip' },
  };
  const rows = _searchLog.map(({ source, status, fields }) => {
    const { icon, cls } = STATUS_META[status] || STATUS_META.non_trouvé;
    const detail = fields.length ? fields.map(f => LABELS[f] || f).join(', ') : statusLabel(status);
    return `<div class="sp-row"><span class="sp-src">${source}</span><span class="sp-status ${cls}">${icon} ${detail}</span></div>`;
  }).join('');

  const pivotEntries = PIVOT_FIELDS.filter(f => _sourceIds[f.key]);
  const pivotSection = pivotEntries.length
    ? `<p class="section-title" style="margin-top:8px;">Identifiants techniques</p>` +
      pivotEntries.map(f => `<div class="sp-row"><span class="sp-src">${f.label}</span><span class="sp-status">${_sourceIds[f.key]}</span></div>`).join('')
    : '';

  pop.innerHTML = rows + pivotSection;
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
  const current = { isbn, source: '', sourceIds: { ..._sourceIds } };
  for (const key of MERGE_KEYS) current[key] = idMap[key] ? get(idMap[key]) : '';
  const hasCover = () => {
    const img = document.getElementById('cover-img');
    return img && img.style.display !== 'none' && !!img.src;
  };

  const { book, sourceIds, contributedFields } = await resolveFromSources(isbn, current, activeKeys, engine, { stopWhenComplete: true });
  _sourceIds = sourceIds;

  let anyFilled = false;
  for (const key of contributedFields) {
    if (!idMap[key]) continue;
    setField(idMap[key], book[key]);
    anyFilled = true;
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

// Intitulés des groupes affichés au-dessus des champs, par cercle d'intérêt du champ
// (cf. src/champs.js) — cercle 1 = socle, 2 = très utile, 3 = forte valeur mais variable.
// Réutilisé à la fois par renderBibFieldsCard() (fiche de saisie) et
// renderBibFieldsChecklist() (panneau de configuration).
export const CIRCLE_LABELS = {
  1: 'Cercle 1 — Socle',
  2: 'Cercle 2 — Très utile',
  3: 'Cercle 3 — Valeur variable',
};

// Construit la grille des champs bibliographiques configurables (hors Titre/Auteur/ISBN,
// toujours statiques, et hors Couverture, gérée par le bloc image dédié), avec un séparateur
// visuel à chaque changement de cercle (BIB_FIELDS/getActiveBibFields() sont déjà triés par
// circle croissant). Titre/Auteur (cercle 1, statiques dans index.html) précèdent directement
// le premier séparateur généré ici — pas de séparateur dupliqué en HTML pour eux, afin d'éviter
// toute désynchronisation avec CIRCLE_LABELS.
export function renderBibFieldsCard() {
  const container = document.getElementById('bib-fields-dynamic');
  if (!container) return;
  const fields = getActiveBibFields().filter(f => !f.isCover);

  let lastCircle = null;
  container.innerHTML = fields.map(f => {
    const heading = f.circle !== lastCircle
      ? `<p class="section-title bib-circle-title full">${CIRCLE_LABELS[f.circle] || ''}</p>` : '';
    lastCircle = f.circle;
    const isTextarea = f.key === 'description';
    const fullClass = isTextarea ? ' full' : '';
    const placeholder = f.key === 'categories' ? ' placeholder="ex. Roman, Philosophie"' : f.key === 'dateed' ? ' placeholder="ex. 2025"' : '';
    const control = isTextarea
      ? `<textarea id="${f.id}" rows="3"></textarea>`
      : `<input type="text" id="${f.id}"${placeholder}>`;
    return `${heading}<div class="field${fullClass}"><label for="${f.id}">${f.label} <span class="lbl-src">ISBN</span><span class="lbl-src lbl-src--notion">Notion</span></label>${control}</div>`;
  }).join('');

  for (const f of fields) {
    document.getElementById(f.id)?.addEventListener('input', function() {
      this.classList.remove('prefilled', 'notion-filled');
    });
  }
}

// Peuple les cases à cocher du panneau « Champs bibliographiques » depuis la config active,
// regroupées par cercle d'intérêt (BIB_FIELDS est déjà trié par circle croissant). Les champs
// obligatoires (MANDATORY_FIELDS, toujours cercle 1) sont affichés en tête, verrouillés (coché
// + disabled) pour montrer qu'ils appartiennent au socle sans pouvoir être décochés.
export function renderBibFieldsChecklist() {
  const container = document.getElementById('bib-fields-checklist');
  if (!container) return;
  const enabled = new Set(getEnabledBibFields() ?? BIB_FIELDS.filter(f => f.defaultOn).map(f => f.key));

  const mandatoryRows = MANDATORY_FIELDS.map(f =>
    `<div class="field checkbox-row"><input type="checkbox" id="bibcfg-mandatory-${f.key}" checked disabled><label for="bibcfg-mandatory-${f.key}">${f.label} <span style="color:var(--muted);font-size:10px;">(toujours actif)</span></label></div>`
  ).join('');

  let lastCircle = 1;
  const bibRows = BIB_FIELDS.map(f => {
    const heading = f.circle !== lastCircle
      ? `<p class="section-title" style="margin-top:10px;">${CIRCLE_LABELS[f.circle] || ''}</p>` : '';
    lastCircle = f.circle;
    return `${heading}<div class="field checkbox-row"><input type="checkbox" id="bibcfg-${f.key}"${enabled.has(f.key) ? ' checked' : ''}><label for="bibcfg-${f.key}">${f.label}</label></div>`;
  }).join('');

  container.innerHTML = `<p class="section-title">${CIRCLE_LABELS[1]}</p>${mandatoryRows}${bibRows}`;
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

// ── Import en masse d'ISBN (voir src/bulkImport.js pour l'orchestration) ───────────────────────

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Jamais l'information portée par la seule couleur (RGAA 3.1) : chaque statut combine une icône,
// une classe couleur et un texte, sur le même principe que STATUS_META dans toggleSourcePopover().
export const BULK_STATUS_META = {
  new:    { icon: '＋', cls: 'sp-ok',   label: 'Nouveau' },
  update: { icon: '↻', cls: 'sp-found', label: 'Mise à jour' },
  manuel: { icon: '⚠', cls: 'sp-warn',  label: 'Saisie manuelle' },
};

const BULK_FIELD_LABELS = Object.fromEntries([...MANDATORY_FIELDS, ...BIB_FIELDS, ...PIVOT_FIELDS].map(f => [f.key, f.label]));

function bulkChangedFieldsLabel(result) {
  const labels = [...(result.changedFields || []), ...(result.pivotFieldsUpdated || [])]
    .map(k => BULK_FIELD_LABELS[k] || k);
  return labels.length ? labels.join(', ') : '—';
}

function bulkResultRowHtml(result, index) {
  const meta = BULK_STATUS_META[result.status] || BULK_STATUS_META.manuel;
  const titre = escapeHtml(result.titre || '(sans titre)');
  const isbn = escapeHtml(result.isbn);
  const rowId = `bulk-row-${index}`;
  return `<tr data-bulk-index="${index}">
    <td><input type="checkbox" id="${rowId}" checked><label for="${rowId}" class="sr-only">Inclure « ${titre} » (${isbn})</label></td>
    <td>${isbn}</td>
    <td>${titre}</td>
    <td><span class="sp-status ${meta.cls}">${meta.icon} ${meta.label}</span></td>
    <td>${escapeHtml(bulkChangedFieldsLabel(result))}</td>
  </tr>`;
}

function bulkInvalidLinesHtml(invalid, duplicates) {
  const parts = [];
  if (invalid.length) {
    parts.push(`<p class="bulk-lines-title">⚠ ${invalid.length} ligne(s) invalide(s) ignorée(s) (ISBN incorrect)</p>` +
      `<ul>${invalid.map(l => `<li>ligne ${l.line} : « ${escapeHtml(l.raw)} »</li>`).join('')}</ul>`);
  }
  if (duplicates.length) {
    parts.push(`<p class="bulk-lines-title">ℹ ${duplicates.length} doublon(s) ignoré(s) (déjà présent plus haut dans la liste)</p>` +
      `<ul>${duplicates.map(l => `<li>ligne ${l.line} : ${escapeHtml(l.isbn)}</li>`).join('')}</ul>`);
  }
  return parts.length ? `<div class="bulk-lines">${parts.join('')}</div>` : '';
}

// Affiche les lignes invalides/dupliquées dès le parsing, avant même de lancer le traitement —
// ne jamais les faire disparaître silencieusement.
export function renderBulkInvalidLines(invalid, duplicates) {
  const el = document.getElementById('bulk-invalid-lines');
  if (!el) return;
  el.innerHTML = bulkInvalidLinesHtml(invalid, duplicates);
}

// Construit le tableau de résultats complet (utilisé pour un rendu initial vide, les lignes sont
// ensuite ajoutées une à une par appendBulkResultRow au fil du traitement — voir main.js).
export function initBulkResultsTable() {
  const card = document.getElementById('bulk-results-card');
  const body = document.getElementById('bulk-results-body');
  const sendStatus = document.getElementById('bulk-send-status');
  if (!card || !body) return;
  body.innerHTML = '';
  if (sendStatus) sendStatus.textContent = '';
  card.style.display = 'block';
  card.setAttribute('aria-hidden', 'false');
}

// Ajoute une ligne de résultat en incrémental (appelé depuis onProgress pendant processFile) —
// évite un écran vide pendant tout le traitement, qui peut prendre plusieurs minutes pour une
// longue liste (chaque ISBN interroge jusqu'à 4 sources bibliographiques).
export function appendBulkResultRow(result, index) {
  const body = document.getElementById('bulk-results-body');
  if (!body) return;
  body.insertAdjacentHTML('beforeend', bulkResultRowHtml(result, index));
}

// Récupère les ISBN dont la case « Inclure » est cochée, dans l'ordre du tableau.
export function getCheckedBulkIndices(count) {
  const indices = [];
  for (let i = 0; i < count; i++) {
    if (document.getElementById(`bulk-row-${i}`)?.checked) indices.push(i);
  }
  return indices;
}

// Met à jour le statut d'envoi d'une ligne (icône + texte, jamais la couleur seule) une fois
// sendBatch() passé sur cette ligne.
export function setBulkRowSendStatus(index, ok, error) {
  const row = document.querySelector(`#bulk-results-body tr[data-bulk-index="${index}"]`);
  if (!row) return;
  const cell = row.children[3];
  const span = document.createElement('span');
  span.className = 'sp-status ' + (ok ? 'sp-ok' : 'sp-err');
  span.textContent = ' · ' + (ok ? '✓ envoyé' : '✗ ' + (error || 'échec'));
  cell.appendChild(span);
}

export function toggleBulkImportPanel() {
  const section = document.getElementById('bulk-import-section');
  if (!section) return;
  const visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : 'block';
  section.setAttribute('aria-hidden', visible ? 'true' : 'false');
  if (!visible) {
    document.getElementById('bulk-isbn-input').value = '';
    document.getElementById('bulk-invalid-lines').innerHTML = '';
    document.getElementById('bulk-progress-status').textContent = '';
    const card = document.getElementById('bulk-results-card');
    if (card) { card.style.display = 'none'; card.setAttribute('aria-hidden', 'true'); }
  }
}
