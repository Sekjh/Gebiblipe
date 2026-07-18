import { isbnVariants } from './isbn.js';
import { BIB_FIELDS, MERGE_KEYS } from './champs.js';

// Normalise les codes langue vers ISO 639-1 (2 lettres) — les catalogues Unimarc (BnF) et
// OpenLibrary renvoient des codes ISO 639-2 (3 lettres, ex. "fre"), Google Books renvoie déjà
// du 639-1. Codes hors table retournés tels quels plutôt que perdus.
const LANG_CODE_MAP = {
  fre: 'fr', fra: 'fr', eng: 'en', ger: 'de', deu: 'de', spa: 'es', esp: 'es',
  ita: 'it', por: 'pt', lat: 'la', grc: 'el', gre: 'el', rus: 'ru', ara: 'ar',
  jpn: 'ja', chi: 'zh', zho: 'zh', nld: 'nl', dut: 'nl',
};
function normalizeLanguage(code) {
  if (!code) return '';
  const c = code.trim().toLowerCase();
  return LANG_CODE_MAP[c] || c;
}

export function fetchWithTimeout(url, options = {}, ms = 5000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

// Extraction des champs UNIMARC communs à BnF et SUDOC (SRU) — les deux catalogues renvoient la
// même structure de notice (datafield/subfield) pour l'ISBN comme pour l'ISSN, seul le contexte
// de requête (bib.isbn/isb= vs bib.issn/isn=) diffère.
function parseUnimarcFields(rec, { appendSubtitle = false } = {}) {
  const gf = (tag,sub) => { const el=rec.querySelector(`datafield[tag="${tag}"] subfield[code="${sub}"]`); return el?el.textContent.trim():''; };
  const gfa = (tag,sub) => Array.from(rec.querySelectorAll(`datafield[tag="${tag}"] subfield[code="${sub}"]`)).map(e=>e.textContent.trim());
  const fields = {};
  fields.titre = gf('200','a');
  if (appendSubtitle) { const esub = gf('200','e'); if (esub && fields.titre) fields.titre += ' — ' + esub; }
  const na=gfa('700','a'), nb=gfa('700','b');
  fields.auteur = na.map((a,i)=>nb[i]?nb[i]+' '+a:a).join(', ');
  if (!fields.auteur) {
    const na2=gfa('701','a'), nb2=gfa('701','b');
    fields.auteur = na2.map((a,i)=>nb2[i]?nb2[i]+' '+a:a).join(', ');
  }
  fields.editeur = gf('210','c')||gf('214','c');
  fields.dateed = gf('210','d')||gf('214','d');
  fields.collection = gf('225','a');
  fields.pages = gf('215','a');
  const lang = gf('101','a');
  if (lang) fields.language = normalizeLanguage(lang);
  return fields;
}

// Interroge un endpoint SRU/UNIMARC (BnF ou SUDOC), fusionne les champs extraits dans `b` et
// capture l'identifiant pivot (ARK pour BnF, PPN pour SUDOC). Retourne true si une notice avec
// titre a été trouvée — utilisé aussi bien pour les requêtes ISBN (avec retry de variantes) que
// ISSN (requête unique, pas de variante 10/13).
async function fetchUnimarcSru(url, b, { sourceLabel, pivotTag, pivotKey, appendSubtitle = false }) {
  const xml = await fetchWithTimeout(url).then(r => r.text());
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const rec = doc.querySelector('record');
  if (!rec) return false;
  Object.assign(b, parseUnimarcFields(rec, { appendSubtitle }));
  const pivot = rec.querySelector(`controlfield[tag="${pivotTag}"]`)?.textContent?.trim();
  if (pivot) { b.sourceIds = b.sourceIds || {}; b.sourceIds[pivotKey] = pivot; }
  if (b.titre) { b.source = sourceLabel; return true; }
  return false;
}

export async function fetchBnF(raw, b) {
  const isbns = isbnVariants(raw);
  for (const isbn of isbns) {
    try {
      const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.isbn+adj+"${isbn}"&recordSchema=unimarcxchange&maximumRecords=1`;
      const found = await fetchUnimarcSru(url, b, {
        sourceLabel: 'BnF ' + (isbn.length === 13 ? 'ISBN-13' : 'ISBN-10'),
        pivotTag: '003', pivotKey: 'ark', appendSubtitle: true,
      });
      if (found) return;
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
}

export async function fetchBnfIssn(raw, b) {
  try {
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.issn+adj+"${raw}"&recordSchema=unimarcxchange&maximumRecords=1`;
    await fetchUnimarcSru(url, b, { sourceLabel: 'BnF ISSN', pivotTag: '003', pivotKey: 'ark', appendSubtitle: true });
  } catch { /* swallow: erreur réseau ou timeout */ }
}

export async function fetchOpenLibrary(raw, b) {
  const isbns = isbnVariants(raw);

  for (const isbn of isbns) {
    try {
      const d=await fetchWithTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`).then(r=>r.json());
      const entry=d[`ISBN:${isbn}`];
      if(!entry) continue;
      const det=entry.details;
      b.titre=det.title||''; b.auteur=det.authors?.map(a=>a.name).join(', ')||'';
      b.editeur=det.publishers?.[0]||''; b.dateed=det.publish_date||''; b.pages=det.number_of_pages||'';
      if(entry.thumbnail_url) b.couverture=entry.thumbnail_url.replace('-S.','-M.');
      const langRaw = det.languages?.[0]?.key?.replace('/languages/','');
      if (langRaw) b.language = normalizeLanguage(langRaw);
      const olid = det.key?.replace('/books/','');
      const oclc = det.identifiers?.oclc?.[0] || det.oclc_numbers?.[0];
      if (olid || oclc) {
        b.sourceIds = b.sourceIds || {};
        if (olid) b.sourceIds.olid = olid;
        if (oclc) b.sourceIds.oclc = oclc;
      }
      if(b.titre) { b.source = 'OpenLibrary ' + (isbn.length === 13 ? 'ISBN-13' : 'ISBN-10'); return; }
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
}

export async function fetchSudoc(raw, b) {
  const isbns = isbnVariants(raw);
  for (const isbn of isbns) {
    try {
      const query = encodeURIComponent(`isb=${isbn}`);
      const url = `https://www.sudoc.abes.fr/cbs/sru?version=1.1&operation=searchRetrieve&query=${query}&recordSchema=unimarc&maximumRecords=1`;
      const found = await fetchUnimarcSru(url, b, {
        sourceLabel: 'SUDOC ' + (isbn.length === 13 ? 'ISBN-13' : 'ISBN-10'),
        pivotTag: '001', pivotKey: 'ppn',
      });
      if (found) return;
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
}

export async function fetchSudocIssn(raw, b) {
  try {
    const query = encodeURIComponent(`isn=${raw}`);
    const url = `https://www.sudoc.abes.fr/cbs/sru?version=1.1&operation=searchRetrieve&query=${query}&recordSchema=unimarc&maximumRecords=1`;
    await fetchUnimarcSru(url, b, { sourceLabel: 'SUDOC ISSN', pivotTag: '001', pivotKey: 'ppn' });
  } catch { /* swallow: erreur réseau ou timeout */ }
}

export async function fetchGoogle(raw, b) {
  const g=await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(raw)}`).then(r=>r.json());
  if(!g.items?.length) return;
  const v=g.items[0].volumeInfo;
  b.titre=v.title||''; b.auteur=v.authors?.join(', ')||''; b.editeur=v.publisher||'';
  b.dateed=v.publishedDate||''; b.pages=v.pageCount||'';
  b.categories=v.categories?.join(', ')||''; b.description=v.description||''; b.language=normalizeLanguage(v.language);
  if(v.imageLinks?.thumbnail) b.couverture=v.imageLinks.thumbnail.replace('http:','https:');
  if(g.items[0].id) { b.sourceIds = b.sourceIds || {}; b.sourceIds.googleVolumeId = g.items[0].id; }
  if(b.titre) b.source='Google Books';
}

// Détecte une vraie image de couverture renvoyée par covers.openlibrary.org. Le service ne renvoie
// JAMAIS d'en-tête Content-Length (réponses en Transfer-Encoding: chunked), y compris pour une
// couverture existante — un test basé sur content-length est donc inopérant (vérifié en direct).
// Le discriminant fiable est Content-Type : présent ("image/jpeg") pour une vraie couverture,
// absent pour le placeholder 1×1 renvoyé (avec un HTTP 200) quand aucune couverture n'existe.
export function isCoverImageResponse(res) {
  return res.ok && (res.headers.get('content-type') || '').startsWith('image/');
}

// Essaie les variantes ISBN puis, si connu, l'OLID de l'édition (capturé par fetchOpenLibrary dans
// b.sourceIds.olid) — augmente le taux de succès quand la liaison OL ISBN→cover échoue mais que la
// liaison OLID→cover existe (ou l'inverse). Retourne la première URL de vignette (-M) validée.
export async function fetchCover(raw, { olid } = {}) {
  const isbnCandidates = raw ? isbnVariants(raw).map(isbn => `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`) : [];
  const candidates = olid ? [...isbnCandidates, `https://covers.openlibrary.org/b/olid/${olid}-M.jpg`] : isbnCandidates;
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, { method: 'HEAD' });
      if (isCoverImageResponse(res)) return url;
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
  return null;
}

// Reconstruit une URL de couverture OpenLibrary en haute résolution (-L), sans nouvel appel réseau :
// OpenLibrary génère les tailles S/M/L à partir de la même image stockée, donc si une vignette -S/-M
// a déjà été validée (par fetchCover ou fetchOpenLibrary), -L existe forcément. Préfère l'OLID
// (édition précisément identifiée) quand connu, sinon reconstruit depuis l'URL déjà obtenue. Une
// couverture qui ne vient pas d'OpenLibrary (ex. Google Books) est retournée telle quelle.
export function openLibraryLargeCoverUrl(coverUrl, olid) {
  if (!coverUrl) return null;
  if (!/covers\.openlibrary\.org/.test(coverUrl)) return coverUrl;
  if (olid) return `https://covers.openlibrary.org/b/olid/${olid}-L.jpg`;
  return coverUrl.replace(/-[SM]\.jpg(\?.*)?$/i, '-L.jpg$1');
}

// Registre unique des sources bibliographiques — pilote l'ordre de préférence dans
// resolveFromSources() (le moteur préféré passe en tête, les autres suivent dans cet ordre fixe).
// OpenLibrary et Google Books n'indexent pas l'ISSN : seules BnF et SUDOC sont utilisables pour
// idType 'issn'.
const FETCHER_REGISTRY = [
  { engine: 'bnf',         idType: 'isbn', fn: fetchBnF,         name: 'BnF' },
  { engine: 'openlibrary', idType: 'isbn', fn: fetchOpenLibrary, name: 'OpenLibrary' },
  { engine: 'google',      idType: 'isbn', fn: fetchGoogle,      name: 'Google Books' },
  { engine: 'sudoc',       idType: 'isbn', fn: fetchSudoc,       name: 'SUDOC' },
  { engine: 'bnf',         idType: 'issn', fn: fetchBnfIssn,     name: 'BnF' },
  { engine: 'sudoc',       idType: 'issn', fn: fetchSudocIssn,   name: 'SUDOC' },
];
function orderedFetchers(engine, idType) {
  const pool = FETCHER_REGISTRY.filter(f => f.idType === idType);
  const first = pool.find(f => f.engine === engine) || pool[0];
  return [first, ...pool.filter(f => f !== first)];
}

// Interroge les sources bibliographiques (dans l'ordre de préférence du moteur choisi) et fusionne
// leurs résultats dans une copie de `current` — fusion « premier champ non vide gagne », jamais
// d'écrasement d'une valeur déjà présente (utile pour compléter une fiche partiellement remplie,
// venue de Notion ou déjà éditée). `activeKeys` restreint les champs bibliographiques ciblés aux
// champs actuellement activés dans la configuration (voir getActiveBibFields() dans champs.js).
// `idType` ('isbn' par défaut, ou 'issn') sélectionne le sous-ensemble de sources pertinentes.
//
// stopWhenComplete (true par défaut) arrête d'interroger les sources suivantes dès que tous les
// champs cibles sont remplis — comportement historique du formulaire unitaire (lookup()/
// complementFromSources() dans ui.js). En mode import en masse (bulkImport.js), on veut au
// contraire toujours interroger les 4 sources pour rafraîchir les identifiants pivots même quand
// les champs bibliographiques sont déjà complets (une source peut apporter un identifiant pivot
// sans contribuer à aucun champ bibliographique) : passer stopWhenComplete: false dans ce cas.
export async function resolveFromSources(raw, current, activeKeys, engine, { stopWhenComplete = true, idType = 'isbn' } = {}) {
  const book = { ...current, isbn: raw };
  for (const key of MERGE_KEYS) if (!book[key]) book[key] = '';
  book.fieldSources = { ...(current.fieldSources || {}) };
  const sourceIds = { ...(current.sourceIds || {}) };
  const searchLog = [];
  const contributedFields = [];
  const sources = [];

  const orderedEntries = orderedFetchers(engine, idType);
  const fetchers = orderedEntries.map(f => f.fn);
  const fetcherNames = new Map(FETCHER_REGISTRY.map(f => [f.fn, f.name]));
  const targetFields = ['titre', 'auteur', ...BIB_FIELDS.filter(f => !f.isCover).map(f => f.key)]
    .filter(f => f === 'titre' || f === 'auteur' || activeKeys.has(f));

  for (let i = 0; i < fetchers.length; i++) {
    const fetcher = fetchers[i];
    if (stopWhenComplete && targetFields.every(f => book[f])) {
      for (const f of fetchers.slice(i)) {
        searchLog.push({ source: fetcherNames.get(f), status: 'non_consulté', fields: [] });
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
    if (tmp.sourceIds) Object.assign(sourceIds, tmp.sourceIds);
    const contributed = [];
    if (tmp.source) {
      for (const key of MERGE_KEYS) {
        if (key !== 'titre' && key !== 'auteur' && !activeKeys.has(key)) continue;
        if (!book[key] && tmp[key]) { book[key] = tmp[key]; book.fieldSources[key] = tmp.source; contributed.push(key); }
      }
    }
    searchLog.push({
      source: tmp.source || fetcherNames.get(fetcher),
      status: contributed.length > 0 ? 'importé' : logStatus,
      fields: contributed,
    });
    if (contributed.length && tmp.source) sources.push(tmp.source);
    contributedFields.push(...contributed);
  }

  book.source = sources.length ? sources.join(' • ') : (current.source || '');
  book.sourceIds = sourceIds;
  const foundByAnySource = searchLog.some(e => e.status === 'trouvé' || e.status === 'importé');
  return { book, sourceIds, searchLog, contributedFields, foundByAnySource };
}
