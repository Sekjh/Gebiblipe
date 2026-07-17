import { getConfig, notionUrl, notionHeaders, getMissingConfigKeys } from './config.js';
import { EXPECTED_PROPS, propSchema } from './themes.js';

// Mode création (null) ou mise à jour (pageId de la page existante)
let _currentPageId = null;
export function setCurrentPageId(id) { _currentPageId = id; }
export function clearCurrentPageId() { _currentPageId = null; }
export function getCurrentPageId() { return _currentPageId; }

function mapNotionToBook(page) {
  const p = page.properties || {};
  const txt  = key => p[key]?.rich_text?.[0]?.plain_text || '';
  const ttl  = key => p[key]?.title?.[0]?.plain_text || '';
  const num  = key => p[key]?.number !== null && p[key]?.number !== undefined ? String(p[key].number) : '';
  const sel  = key => p[key]?.select?.name || '';
  const chk  = key => p[key]?.checkbox || false;

  const datelu = txt('Date de lecture');
  const parts  = datelu.trim().split(/\s+/);
  const datem  = parts[0] || '';
  const datey  = parts[1] || '';

  return {
    isbn:        txt('ISBN'),
    titre:       ttl('Nom'),
    auteur:      txt('Auteur'),
    nationalite: txt('Nationalité'),
    editeur:     txt('Éditeur'),
    collection:  txt('Collection'),
    dateed:      txt('Date édition'),
    datepub:     txt('Publication originale'),
    pages:       num('Pages'),
    theme:       sel('Thème'),
    soustheme:   sel('Sous-thème'),
    statut:      sel('Statut'),
    priorite:    sel('Priorité'),
    datem,
    datey,
    note:        sel('Note'),
    etat:        sel('État'),
    fcollection: chk('Collection (livre)'),
    fiche:       txt('Fiche de lecture'),
    citations:   txt('Citations'),
    commentaire: txt('Commentaire'),
    couverture:  page.cover?.external?.url || page.cover?.file?.url || '',
    fromNotion:  true,
    notionPageId: page.id,
    source:      'Notion',
    searchLog:   [],
    fieldSources: {},
  };
}

export async function lookupFromNotion(isbn, cfg) {
  if (!cfg.token || !cfg.dbId) return { found: false };
  try {
    const res = await fetch(notionUrl('/v1/databases/' + cfg.dbId + '/query', cfg), {
      method: 'POST',
      headers: notionHeaders(cfg.token),
      body: JSON.stringify({ filter: { property: 'ISBN', rich_text: { equals: isbn } } })
    });
    if (!res.ok) return { found: false };
    const data = await res.json();
    if (!data.results?.length) return { found: false };
    // Prendre le plus ancien (created_time ASC)
    const sorted = [...data.results].sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
    const page = sorted[0];
    return { found: true, book: mapNotionToBook(page), pageId: page.id };
  } catch {
    return { found: false };
  }
}

export async function syncDatabaseProps(token, dbId, cfg) {
  let dbRes;
  try {
    dbRes = await fetch(notionUrl(`/v1/databases/${dbId}`, cfg), { headers: notionHeaders(token) });
  } catch(e) {
    return { ok: false, error: 'Erreur réseau : ' + e.message };
  }

  if (dbRes.status === 404) return { ok: false, error: 'Base introuvable. Vérifie le Database ID et que l\'intégration est bien connectée à la base dans Notion.' };
  if (dbRes.status === 401) return { ok: false, error: 'Token invalide ou intégration non autorisée.' };
  if (!dbRes.ok) {
    const err = await dbRes.json().catch(() => ({}));
    return { ok: false, error: 'Erreur Notion ' + dbRes.status + ' : ' + (err.message || '') };
  }

  const db = await dbRes.json();
  const existing = db.properties || {};
  const missing = [];
  const conflicts = [];

  for (const [name, expectedType] of Object.entries(EXPECTED_PROPS)) {
    if (!existing[name]) {
      missing.push(name);
    } else if (existing[name].type !== expectedType) {
      conflicts.push({ name, expected: expectedType, actual: existing[name].type });
    }
  }

  const created = [];
  if (missing.length > 0) {
    const newProps = {};
    for (const name of missing) newProps[name] = propSchema(EXPECTED_PROPS[name]);
    const patchRes = await fetch(notionUrl(`/v1/databases/${dbId}`, cfg), {
      method: 'PATCH',
      headers: notionHeaders(token),
      body: JSON.stringify({ properties: newProps })
    });
    if (patchRes.ok) {
      created.push(...missing);
    } else {
      const err = await patchRes.json().catch(() => ({}));
      return { ok: false, error: 'Impossible de créer les propriétés manquantes : ' + (err.message || patchRes.status) };
    }
  }

  return { ok: true, created, conflicts };
}

export function updateConfigWarning() {
  const btn = document.getElementById('btn-toggle-config');
  if (!btn) return;
  const missing = getMissingConfigKeys(getConfig());
  let dot = document.getElementById('config-warn-dot');
  if (missing.length > 0) {
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'config-warn-dot';
      dot.className = 'config-warn-dot';
      dot.setAttribute('aria-hidden', 'true');
      btn.appendChild(dot);
    }
    btn.setAttribute('aria-label', '⚙ configuration — configuration Notion incomplète');
  } else {
    if (dot) dot.remove();
    btn.removeAttribute('aria-label');
  }
}

export async function saveConfig() {
  const token = document.getElementById('cfg-token').value.trim();
  let dbRaw   = document.getElementById('cfg-dbid').value.trim();
  const proxy = document.getElementById('cfg-proxy').value.trim().replace(/\/$/, '');
  const statusEl = document.getElementById('config-status');

  const urlMatch = dbRaw.match(/notion\.so\/(?:[^/]+\/)?([a-f0-9]{32})/i);
  if (urlMatch) dbRaw = urlMatch[1];
  const dbId = dbRaw.replace(/[^a-f0-9]/gi, '');

  if (!token.startsWith('ntn_') && !token.startsWith('secret_')) {
    statusEl.textContent = '⚠️ Token invalide (doit commencer par ntn_ ou secret_).';
    return;
  }
  if (dbId.length !== 32) {
    statusEl.textContent = '⚠️ Database ID invalide (32 caractères attendus).';
    return;
  }
  if (!proxy || !proxy.startsWith('https://')) {
    statusEl.textContent = '⚠️ URL du proxy invalide (doit commencer par https://).';
    return;
  }

  const anthropicKey = document.getElementById('cfg-anthropic').value.trim();
  if (anthropicKey) localStorage.setItem('anthropic_key', anthropicKey);
  localStorage.setItem('notion_token', token);
  localStorage.setItem('notion_dbid', dbId);
  localStorage.setItem('notion_proxy', proxy);
  localStorage.setItem('search_engine', document.getElementById('cfg-engine').value);
  statusEl.textContent = '🔄 Vérification de la base Notion…';

  const result = await syncDatabaseProps(token, dbId, { proxy: localStorage.getItem('notion_proxy') || '' });
  if (!result.ok) {
    statusEl.textContent = '🔴 ' + result.error;
    return;
  }

  let msg = '✅ Connexion Notion OK.';
  if (result.created.length > 0) msg += ' Propriétés créées : ' + result.created.join(', ') + '.';
  if (result.conflicts.length > 0) msg += ' ⚠️ Conflits (type différent, non modifié) : ' + result.conflicts.map(c => `${c.name} (attendu ${c.expected}, existant ${c.actual})`).join(', ') + '.';
  if (result.created.length === 0 && result.conflicts.length === 0) msg += ' Toutes les propriétés sont à jour.';
  statusEl.textContent = msg;
  statusEl.style.whiteSpace = 'normal';
  updateConfigWarning();
}

export function toggleConfig() {
  const p = document.getElementById('config-panel');
  const visible = p.style.display !== 'none';
  p.style.display = visible ? 'none' : 'block';
  p.setAttribute('aria-hidden', visible ? 'true' : 'false');
  if (!visible) {
    const cfg = getConfig();
    document.getElementById('cfg-anthropic').value = cfg.anthropicKey;
    document.getElementById('cfg-proxy').value = cfg.proxy;
    document.getElementById('cfg-token').value = cfg.token;
    document.getElementById('cfg-dbid').value = cfg.dbId;
    document.getElementById('cfg-engine').value = localStorage.getItem('search_engine') || 'bnf';
    document.getElementById('config-status').textContent = '';
  }
}

export async function sendToNotion() {
  const cfg = getConfig();
  if (!cfg.token || !cfg.dbId) {
    document.getElementById('notion-status').textContent = '⚙ Configure d\'abord le token Notion (lien en bas de page).';
    return;
  }

  const notionStatus = document.getElementById('notion-status');
  notionStatus.textContent = '🔄 Vérification de la base…';

  const sync = await syncDatabaseProps(cfg.token, cfg.dbId, cfg);
  if (!sync.ok) {
    notionStatus.textContent = '🔴 ' + sync.error;
    return;
  }

  if (_currentPageId) {
    await updatePageFull(_currentPageId, cfg, sync);
  } else {
    await doSend(cfg, sync);
  }
}

function buildProps(get, cb, sync) {
  const props = {
    'Nom':                 { title: [{ text: { content: get('f-titre') || '(sans titre)' } }] },
    'Auteur':              { rich_text: [{ text: { content: get('f-auteur') } }] },
    'Nationalité':         { rich_text: [{ text: { content: get('f-nationalite') } }] },
    'Éditeur':             { rich_text: [{ text: { content: get('f-editeur') } }] },
    'Collection':          { rich_text: [{ text: { content: get('f-collection-ed') } }] },
    'ISBN':                { rich_text: [{ text: { content: get('f-isbn') } }] },
    'Publication originale':{ rich_text: [{ text: { content: get('f-datepub') } }] },
    'Date édition':        { rich_text: [{ text: { content: get('f-dateed') } }] },
    'Pages':               get('f-pages') ? { number: parseInt(get('f-pages')) || null } : undefined,
    'Thème':               get('f-theme')     ? { select: { name: get('f-theme') } }     : undefined,
    'Sous-thème':          get('f-soustheme') ? { select: { name: get('f-soustheme') } } : undefined,
    'Statut':              { select: { name: get('f-statut') || 'À lire' } },
    'Priorité':            get('f-priorite')  ? { select: { name: get('f-priorite') } }  : undefined,
    'Date de lecture':     { rich_text: [{ text: { content: (()=>{ const m=get('f-datelu-mois'),a=get('f-datelu-annee'); return m&&a?m+' '+a:(m||a||''); })() } }] },
    'Note':                get('f-note')  ? { select: { name: get('f-note') } }  : undefined,
    'État':                get('f-etat')  ? { select: { name: get('f-etat') } }  : undefined,
    'Collection (livre)':  { checkbox: cb('f-collection') },
    'Fiche de lecture':    { rich_text: [{ text: { content: get('f-fiche') } }] },
    'Citations':           { rich_text: [{ text: { content: get('f-citations') } }] },
    'Commentaire':         { rich_text: [{ text: { content: get('f-comment') } }] },
  };
  for (const c of sync.conflicts) delete props[c.name];
  Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);
  return props;
}

export async function updatePageFull(pageId, cfg, sync) {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const cb  = id => document.getElementById(id)?.checked || false;
  const notionStatus = document.getElementById('notion-status');
  notionStatus.textContent = '🔄 Mise à jour en cours…';

  const props = buildProps(get, cb, sync);
  const body = { properties: props };
  const coverImg = document.getElementById('cover-img');
  if (coverImg.src && coverImg.style.display !== 'none') {
    body.cover = { type: 'external', external: { url: coverImg.src } };
  }

  try {
    const res = await fetch(notionUrl(`/v1/pages/${pageId}`, cfg), {
      method: 'PATCH',
      headers: notionHeaders(cfg.token),
      body: JSON.stringify(body)
    });
    if (res.ok) {
      notionStatus.textContent = '✅ Mis à jour dans Notion !';
      notionStatus.style.whiteSpace = 'normal';
      setTimeout(() => { notionStatus.textContent = ''; notionStatus.style.whiteSpace = ''; }, 5000);
    } else {
      const err = await res.json().catch(() => ({}));
      notionStatus.textContent = '🔴 Erreur Notion : ' + (err.message || res.status);
      notionStatus.style.whiteSpace = 'normal';
    }
  } catch(e) {
    notionStatus.textContent = '🔴 Erreur réseau : ' + e.message;
  }
}

export async function doSend(cfg, sync) {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const cb  = id => document.getElementById(id)?.checked || false;
  const notionStatus = document.getElementById('notion-status');
  let syncMsg = '';
  if (sync.created.length > 0) syncMsg += ' Propriétés créées : ' + sync.created.join(', ') + '.';
  if (sync.conflicts.length > 0) syncMsg += ' ⚠️ Conflits ignorés : ' + sync.conflicts.map(c => c.name).join(', ') + '.';

  notionStatus.textContent = '🔄 Envoi en cours…';

  const props = buildProps(get, cb, sync);
  const body = { parent: { database_id: cfg.dbId }, properties: props };
  const coverImg = document.getElementById('cover-img');
  if (coverImg.src && coverImg.style.display !== 'none') {
    body.cover = { type: 'external', external: { url: coverImg.src } };
  }

  try {
    const res = await fetch(notionUrl('/v1/pages', cfg), {
      method: 'POST',
      headers: notionHeaders(cfg.token),
      body: JSON.stringify(body)
    });
    if (res.ok) {
      notionStatus.textContent = '✅ Ajouté dans Notion !' + syncMsg;
      notionStatus.style.whiteSpace = 'normal';
      setTimeout(() => { notionStatus.textContent = ''; notionStatus.style.whiteSpace = ''; }, 5000);
    } else {
      const err = await res.json().catch(() => ({}));
      notionStatus.textContent = '🔴 Erreur Notion : ' + (err.message || res.status);
      notionStatus.style.whiteSpace = 'normal';
    }
  } catch(e) {
    notionStatus.textContent = '🔴 Erreur réseau : ' + e.message;
  }
}
