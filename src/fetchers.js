import { isbn13to10 } from './isbn.js';

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
