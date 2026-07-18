import { validateIsbn } from './isbn.js';
import { lookupFromNotion, syncDatabaseProps, buildProps, createNotionPage, updateNotionPage } from './notion.js';
import { resolveFromSources, fetchCover, openLibraryLargeCoverUrl } from './fetchers.js';
import { BIB_FIELDS, MERGE_KEYS } from './champs.js';
import { detectCollection } from './ui.js';

// Convertit une liste d'ISBN collée dans le champ libre (un par ligne) en trois catégories :
// valides (traitables), invalides (checksum incorrect), doublons (déjà vus plus haut dans la
// liste, seule la première occurrence est conservée). Les lignes vides sont ignorées sans trace.
export function parseIsbnList(text) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];

  (text || '').split(/\r?\n/).forEach((rawLine, i) => {
    const line = i + 1;
    const cleaned = rawLine.replace(/[^0-9Xx-]/g, '').trim();
    const isbn = cleaned.replace(/[-\s]/g, '');
    if (!isbn) return;
    if (!validateIsbn(isbn)) { invalid.push({ line, raw: rawLine.trim() }); return; }
    if (seen.has(isbn)) { duplicates.push({ line, isbn }); return; }
    seen.add(isbn);
    valid.push(isbn);
  });

  return { valid, invalid, duplicates };
}

// Traite un ISBN : vérifie Notion, complète les champs vides via les sources bibliographiques
// (en interrogeant systématiquement les 4 sources — stopWhenComplete:false — pour rafraîchir les
// identifiants pivots même sur une fiche déjà complète), calcule la case « Saisie manuelle ».
//
// Règle « Saisie manuelle » en mode import en masse (différente du flux unitaire) : cochée dès que
// l'étape API n'a retrouvé le livre auprès d'AUCUNE source, même si la fiche existait déjà dans
// Notion — d'où l'usage de foundByAnySource (et non contributedFields.length) : une fiche Notion
// déjà complète peut être « retrouvée » par une source sans que celle-ci ait de champ à y ajouter.
export async function processIsbn(raw, cfg, engine, activeKeys) {
  const notionResult = await lookupFromNotion(raw, cfg);
  const fromNotion = notionResult.found;

  const current = fromNotion ? { ...notionResult.book } : { isbn: raw, source: '' };
  for (const key of MERGE_KEYS) if (current[key] === undefined) current[key] = '';
  if (current.sourceIds === undefined) current.sourceIds = {};

  const { book, sourceIds, contributedFields, foundByAnySource } =
    await resolveFromSources(raw, current, activeKeys, engine, { stopWhenComplete: false });

  if (activeKeys.has('couverture') && !book.couverture) {
    const cover = await fetchCover(raw, { olid: sourceIds.olid });
    if (cover) {
      book.couverture = cover;
      book.fieldSources = { ...book.fieldSources, couverture: 'OL Covers' };
      contributedFields.push('couverture');
    }
  }
  if (!activeKeys.has('couverture')) book.couverture = '';

  if (!fromNotion) {
    book.fcollection = detectCollection(book).detected;
  }

  const manualEntry = !foundByAnySource;
  const status = manualEntry ? 'manuel' : (fromNotion ? 'update' : 'new');

  return {
    isbn: raw,
    fromNotion,
    pageId: fromNotion ? notionResult.pageId : null,
    status,
    book,
    sourceIds,
    manualEntry,
    changedFields: contributedFields,
    pivotFieldsUpdated: Object.keys(sourceIds),
    titre: book.titre,
  };
}

// Boucle séquentielle (pas de parallélisme — aucune infrastructure de throttling n'existe dans le
// projet ; respecte à la fois la limite ~3 req/s de Notion et la courtoisie envers les SRU BnF/SUDOC).
export async function processFile(rows, cfg, engine, activeKeys, onProgress) {
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const result = await processIsbn(rows[i], cfg, engine, activeKeys);
    results.push(result);
    if (onProgress) onProgress(i + 1, rows.length, result);
  }
  return results;
}

// Correspondance id de champ DOM (tel que lu par buildProps() dans notion.js) ↔ clé du livre —
// centralisée ici car buildProps() lit une dizaine de champs distincts (bibliographiques +
// lecture/statut) qu'un enregistrement issu du batch doit tous pouvoir fournir, y compris ceux
// qui n'ont rien à voir avec la bibliographie (Statut, Thème…) pour ne pas les effacer par
// inadvertance sur une fiche déjà existante dans Notion.
export const FIELD_ID_TO_BOOK_KEY = {
  'f-titre': 'titre',
  'f-auteur': 'auteur',
  'f-isbn': 'isbn',
  'f-theme': 'theme',
  'f-soustheme': 'soustheme',
  'f-statut': 'statut',
  'f-priorite': 'priorite',
  'f-datelu-mois': 'datem',
  'f-datelu-annee': 'datey',
  'f-note': 'note',
  'f-etat': 'etat',
  'f-fiche': 'fiche',
  'f-citations': 'citations',
  'f-comment': 'commentaire',
  ...Object.fromEntries(BIB_FIELDS.filter(f => !f.isCover).map(f => [f.id, f.key])),
};

// Envoie un enregistrement traité vers Notion (création ou mise à jour selon record.pageId),
// en réutilisant buildProps() (notion.js) via des accesseurs objet plutôt que DOM. Aucune garde
// de champ obligatoire ici : l'ISBN est déjà validé (checksum) par parseIsbnList() en amont,
// et ce flux n'a pas de mode manuel (voir sendToNotion() pour la garde ISBN/Titre du flux unitaire).
export async function sendRecord(record, cfg, sync) {
  const book = record.book;

  const get = id => {
    const key = FIELD_ID_TO_BOOK_KEY[id];
    const val = key ? book[key] : undefined;
    return val === undefined || val === null ? '' : String(val).trim();
  };
  const cb = id => id === 'f-collection' ? !!book.fcollection : false;

  const props = buildProps(get, cb, sync, { manualEntry: record.manualEntry, sourceIds: record.sourceIds });
  const coverUrl = openLibraryLargeCoverUrl(book.couverture, record.sourceIds?.olid) || null;

  return record.pageId
    ? updateNotionPage(record.pageId, cfg, props, coverUrl)
    : createNotionPage(cfg, props, coverUrl);
}

// Synchronise le schéma Notion UNE SEULE FOIS avant l'envoi groupé (comme sendToNotion() pour le
// flux unitaire), puis envoie séquentiellement chaque enregistrement retenu.
export async function sendBatch(records, cfg, onProgress) {
  const sync = await syncDatabaseProps(cfg.token, cfg.dbId, cfg);
  if (!sync.ok) return { ok: false, error: sync.error, results: [] };

  const results = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const result = await sendRecord(record, cfg, sync);
    results.push({ isbn: record.isbn, ...result });
    if (onProgress) onProgress(i + 1, records.length, result);
  }
  return { ok: true, results };
}
