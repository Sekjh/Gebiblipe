import { isbn13to10 } from './isbn.js';
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

export async function fetchBnF(raw, b) {
  const isbns = [raw];
  const isbn10 = isbn13to10(raw);
  if (isbn10) isbns.push(isbn10);

  for (const isbn of isbns) {
    try {
      const xml = await fetchWithTimeout(`https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.isbn+adj+"${isbn}"&recordSchema=unimarcxchange&maximumRecords=1`).then(r=>r.text());
      const doc = new DOMParser().parseFromString(xml,'text/xml');
      const rec = doc.querySelector('record');
      if (!rec) continue;
      const gf = (tag,sub) => { const el=rec.querySelector(`datafield[tag="${tag}"] subfield[code="${sub}"]`); return el?el.textContent.trim():''; };
      const gfa = (tag,sub) => Array.from(rec.querySelectorAll(`datafield[tag="${tag}"] subfield[code="${sub}"]`)).map(e=>e.textContent.trim());
      b.titre = gf('200','a'); const esub=gf('200','e'); if(esub&&b.titre) b.titre+=' — '+esub;
      const na=gfa('700','a'),nb=gfa('700','b'); b.auteur=na.map((a,i)=>nb[i]?nb[i]+' '+a:a).join(', ');
      if(!b.auteur){const na2=gfa('701','a'),nb2=gfa('701','b');b.auteur=na2.map((a,i)=>nb2[i]?nb2[i]+' '+a:a).join(', ');}
      b.editeur=gf('210','c')||gf('214','c'); b.dateed=gf('210','d')||gf('214','d');
      b.collection=gf('225','a'); b.pages=gf('215','a');
      const lang = gf('101','a'); if (lang) b.language = normalizeLanguage(lang);
      const ark = rec.querySelector('controlfield[tag="003"]')?.textContent?.trim();
      if (ark) { b.sourceIds = b.sourceIds || {}; b.sourceIds.ark = ark; }
      if(b.titre) { b.source = (isbn === raw) ? 'BnF ISBN-13' : 'BnF ISBN-10'; return; }
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
}

export async function fetchOpenLibrary(raw, b) {
  const isbns = [raw];
  const isbn10 = isbn13to10(raw);
  if (isbn10) isbns.push(isbn10);

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
      if(b.titre) { b.source = (isbn === raw) ? 'OpenLibrary ISBN-13' : 'OpenLibrary ISBN-10'; return; }
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
}

export async function fetchSudoc(raw, b) {
  const isbns = [raw];
  const isbn10 = isbn13to10(raw);
  if (isbn10) isbns.push(isbn10);

  for (const isbn of isbns) {
    try {
      const query = encodeURIComponent(`isb=${isbn}`);
      const xml = await fetchWithTimeout(`https://www.sudoc.abes.fr/cbs/sru?version=1.1&operation=searchRetrieve&query=${query}&recordSchema=unimarc&maximumRecords=1`).then(r=>r.text());
      const doc = new DOMParser().parseFromString(xml,'text/xml');
      const rec = doc.querySelector('record');
      if (!rec) continue;
      const gf = (tag,sub) => { const el=rec.querySelector(`datafield[tag="${tag}"] subfield[code="${sub}"]`); return el?el.textContent.trim():''; };
      const gfa = (tag,sub) => Array.from(rec.querySelectorAll(`datafield[tag="${tag}"] subfield[code="${sub}"]`)).map(e=>e.textContent.trim());
      b.titre = gf('200','a');
      const na=gfa('700','a'),nb=gfa('700','b'); b.auteur=na.map((a,i)=>nb[i]?nb[i]+' '+a:a).join(', ');
      if(!b.auteur){const na2=gfa('701','a'),nb2=gfa('701','b');b.auteur=na2.map((a,i)=>nb2[i]?nb2[i]+' '+a:a).join(', ');}
      b.editeur=gf('210','c')||gf('214','c'); b.dateed=gf('210','d')||gf('214','d');
      b.collection=gf('225','a'); b.pages=gf('215','a');
      const lang = gf('101','a'); if (lang) b.language = normalizeLanguage(lang);
      const ppn = rec.querySelector('controlfield[tag="001"]')?.textContent?.trim();
      if (ppn) { b.sourceIds = b.sourceIds || {}; b.sourceIds.ppn = ppn; }
      if(b.titre) { b.source = (isbn === raw) ? 'SUDOC ISBN-13' : 'SUDOC ISBN-10'; return; }
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
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

export async function fetchCover(raw) {
  const isbns = [raw];
  const isbn10 = isbn13to10(raw);
  if (isbn10) isbns.push(isbn10);
  for (const isbn of isbns) {
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok && parseInt(res.headers.get('content-length') || '9999') > 1000) {
        return url;
      }
    } catch { /* swallow: erreur réseau ou timeout */ }
  }
  return null;
}

// Registre unique des sources bibliographiques — pilote l'ordre de préférence dans
// resolveFromSources() (le moteur préféré passe en tête, les autres suivent dans cet ordre fixe).
const FETCHER_REGISTRY = [
  { engine: 'bnf',         fn: fetchBnF,         name: 'BnF' },
  { engine: 'openlibrary', fn: fetchOpenLibrary, name: 'OpenLibrary' },
  { engine: 'google',      fn: fetchGoogle,      name: 'Google Books' },
  { engine: 'sudoc',       fn: fetchSudoc,       name: 'SUDOC' },
];
function orderedFetchers(engine) {
  const first = FETCHER_REGISTRY.find(f => f.engine === engine) || FETCHER_REGISTRY[0];
  return [first, ...FETCHER_REGISTRY.filter(f => f !== first)];
}

// Interroge les sources bibliographiques (dans l'ordre de préférence du moteur choisi) et fusionne
// leurs résultats dans une copie de `current` — fusion « premier champ non vide gagne », jamais
// d'écrasement d'une valeur déjà présente (utile pour compléter une fiche partiellement remplie,
// venue de Notion ou déjà éditée). `activeKeys` restreint les champs bibliographiques ciblés aux
// champs actuellement activés dans la configuration (voir getActiveBibFields() dans champs.js).
//
// stopWhenComplete (true par défaut) arrête d'interroger les sources suivantes dès que tous les
// champs cibles sont remplis — comportement historique du formulaire unitaire (lookup()/
// complementFromSources() dans ui.js). En mode import en masse (bulkImport.js), on veut au
// contraire toujours interroger les 4 sources pour rafraîchir les identifiants pivots même quand
// les champs bibliographiques sont déjà complets (une source peut apporter un identifiant pivot
// sans contribuer à aucun champ bibliographique) : passer stopWhenComplete: false dans ce cas.
export async function resolveFromSources(raw, current, activeKeys, engine, { stopWhenComplete = true } = {}) {
  const book = { ...current, isbn: raw };
  for (const key of MERGE_KEYS) if (!book[key]) book[key] = '';
  book.fieldSources = { ...(current.fieldSources || {}) };
  const sourceIds = { ...(current.sourceIds || {}) };
  const searchLog = [];
  const contributedFields = [];
  const sources = [];

  const fetchers = orderedFetchers(engine).map(f => f.fn);
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
