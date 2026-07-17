// @vitest-environment jsdom
// jsdom requis : processIsbn()/processFile() exercent les vrais fetchers (src/fetchers.js),
// qui utilisent DOMParser pour BnF/SUDOC (voir tests/unit/fetchers.test.js, même contrainte).
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const bnfFound = readFileSync(join(fixturesDir, 'bnf-found.xml'), 'utf8');
const bnfEmpty = readFileSync(join(fixturesDir, 'bnf-empty.xml'), 'utf8');
const dbFull = JSON.parse(readFileSync(join(fixturesDir, 'notion-db-full.json'), 'utf8'));

import { parseIsbnList, processIsbn, processFile, sendRecord, sendBatch, FIELD_ID_TO_BOOK_KEY } from '../../src/bulkImport.js';

const CFG = { token: 'ntn_x', dbId: 'abcdef1234567890abcdef1234567890', proxy: '' };
const NOT_FOUND_NOTION = { ok: true, json: async () => ({ results: [] }) };
// Réponse générique « rien trouvé », utilisable aussi bien par les fetchers texte (BnF/SUDOC)
// que JSON (OpenLibrary/Google) — évite de devoir prédire le nombre exact d'appels (fallback
// ISBN-13 → ISBN-10 pour BnF/OpenLibrary/SUDOC).
const NOTHING_FOUND = { ok: true, text: async () => bnfEmpty, json: async () => ({}) };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

const ACTIVE_KEYS = new Set(['editeur', 'dateed', 'language', 'pages']);

// ─── parseIsbnList ─────────────────────────────────────────────────────────

describe('parseIsbnList', () => {
  test('parse une liste d\'ISBN valides, un par ligne', () => {
    const { valid, invalid, duplicates } = parseIsbnList('9782070360024\n9780306406157');
    expect(valid).toEqual(['9782070360024', '9780306406157']);
    expect(invalid).toEqual([]);
    expect(duplicates).toEqual([]);
  });

  test('ignore silencieusement les lignes vides', () => {
    const { valid } = parseIsbnList('9782070360024\n\n\n9780306406157\n');
    expect(valid).toEqual(['9782070360024', '9780306406157']);
  });

  test('signale les lignes à checksum invalide sans les inclure dans valid', () => {
    const { valid, invalid } = parseIsbnList('9782070360024\n9782070360025');
    expect(valid).toEqual(['9782070360024']);
    expect(invalid).toEqual([{ line: 2, raw: '9782070360025' }]);
  });

  test('signale les doublons (garde la 1re occurrence dans valid)', () => {
    const { valid, duplicates } = parseIsbnList('9782070360024\n9782070360024');
    expect(valid).toEqual(['9782070360024']);
    expect(duplicates).toEqual([{ line: 2, isbn: '9782070360024' }]);
  });

  test('tolère les tirets/espaces dans une ligne', () => {
    const { valid } = parseIsbnList('978-2-07-036002-4');
    expect(valid).toEqual(['9782070360024']);
  });
});

// ─── processIsbn ────────────────────────────────────────────────────────────

describe('processIsbn', () => {
  test('fiche neuve trouvée via une source bibliographique → status "new"', async () => {
    fetch
      .mockResolvedValueOnce(NOT_FOUND_NOTION)                      // lookupFromNotion
      .mockResolvedValueOnce({ ok: true, text: async () => bnfFound }) // BnF trouve le livre
      .mockResolvedValue(NOTHING_FOUND);                             // le reste (OL/Google/SUDOC) : rien

    const result = await processIsbn('9782070360024', CFG, 'bnf', ACTIVE_KEYS);

    expect(result.fromNotion).toBe(false);
    expect(result.pageId).toBeNull();
    expect(result.status).toBe('new');
    expect(result.manualEntry).toBe(false);
    expect(result.book.titre).toContain('Le Capital');
    expect(result.changedFields).toContain('titre');
    expect(result.pivotFieldsUpdated).toContain('ark');
  });

  test('aucune source ne retrouve un ISBN absent de Notion → status "manuel"', async () => {
    fetch.mockResolvedValueOnce(NOT_FOUND_NOTION).mockResolvedValue(NOTHING_FOUND);

    const result = await processIsbn('9782070360024', CFG, 'bnf', ACTIVE_KEYS);

    expect(result.fromNotion).toBe(false);
    expect(result.status).toBe('manuel');
    expect(result.manualEntry).toBe(true);
    expect(result.book.titre).toBe('');
  });

  test('fiche déjà présente dans Notion mais complétée par une source → status "update"', async () => {
    const notionBook = {
      titre: 'Le Capital', auteur: 'Karl Marx', editeur: '', dateed: '1969', language: 'fr', pages: '900',
    };
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ id: 'page-1', created_time: '2023-01-01', properties: {
        Nom: { title: [{ plain_text: notionBook.titre }] },
        Auteur: { rich_text: [{ plain_text: notionBook.auteur }] },
        'Date édition': { rich_text: [{ plain_text: notionBook.dateed }] },
        Langue: { rich_text: [{ plain_text: notionBook.language }] },
        Pages: { number: 900 },
      } }] }) }) // lookupFromNotion → trouvé, Éditeur vide
      .mockResolvedValueOnce({ ok: true, text: async () => bnfFound }) // BnF comble le trou Éditeur
      .mockResolvedValue(NOTHING_FOUND);

    const result = await processIsbn('9782070360024', CFG, 'bnf', ACTIVE_KEYS);

    expect(result.fromNotion).toBe(true);
    expect(result.pageId).toBe('page-1');
    expect(result.status).toBe('update');
    expect(result.manualEntry).toBe(false);
    expect(result.book.titre).toBe('Le Capital'); // valeur Notion préservée, non écrasée
    expect(result.changedFields).toContain('editeur'); // trou comblé par BnF
  });

  test("fiche déjà présente dans Notion mais qu'aucune source ne retrouve → status \"manuel\" (règle divergente du flux unitaire)", async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ id: 'page-1', created_time: '2023-01-01', properties: {
        Nom: { title: [{ plain_text: 'Titre incomplet' }] },
        Auteur: { rich_text: [{ plain_text: 'Auteur' }] },
      } }] }) })
      .mockResolvedValue(NOTHING_FOUND);

    const result = await processIsbn('9782070360024', CFG, 'bnf', ACTIVE_KEYS);

    expect(result.fromNotion).toBe(true);
    expect(result.status).toBe('manuel');
    expect(result.manualEntry).toBe(true);
  });
});

// ─── processFile ────────────────────────────────────────────────────────────

describe('processFile', () => {
  test('traite chaque ISBN séquentiellement et appelle onProgress à chaque étape', async () => {
    fetch.mockResolvedValue(NOTHING_FOUND); // toutes les recherches (Notion + sources) échouent

    const progressCalls = [];
    const results = await processFile(
      ['9782070360024', '9780306406157'], CFG, 'bnf', ACTIVE_KEYS,
      (done, total, result) => progressCalls.push([done, total, result.isbn])
    );

    expect(results).toHaveLength(2);
    expect(progressCalls).toEqual([
      [1, 2, '9782070360024'],
      [2, 2, '9780306406157'],
    ]);
  });
});

// ─── sendRecord ─────────────────────────────────────────────────────────────

describe('sendRecord', () => {
  test('crée une page (POST) quand record.pageId est absent', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new-page' }) });
    const record = {
      book: { titre: 'Titre', auteur: 'Auteur', isbn: '9782070360024', editeur: 'Éditeur X', pages: '100' },
      pageId: null, manualEntry: false, sourceIds: { ark: 'ark:/123' },
    };
    const result = await sendRecord(record, CFG, { conflicts: [] });
    expect(result.ok).toBe(true);
    const [url, opts] = fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/v1/pages');
    const body = JSON.parse(opts.body);
    expect(body.properties['Nom'].title[0].text.content).toBe('Titre');
    expect(body.properties['ARK BnF'].rich_text[0].text.content).toBe('ark:/123');
    expect(body.properties['Saisie manuelle'].checkbox).toBe(false);
  });

  test('met à jour une page (PATCH) quand record.pageId est fourni, en reportant les champs de lecture inchangés', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'page-1' }) });
    const record = {
      book: {
        titre: 'Titre', auteur: 'Auteur', isbn: '9782070360024',
        statut: 'Lu', priorite: '', note: '★★★★★', theme: 'Histoire', soustheme: '',
        datem: 'Juin', datey: '2024', fiche: 'Ma fiche.', citations: '', commentaire: '', etat: '',
        fcollection: true,
      },
      pageId: 'page-1', manualEntry: false, sourceIds: {},
    };
    const result = await sendRecord(record, CFG, { conflicts: [] });
    expect(result.ok).toBe(true);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Statut'].select.name).toBe('Lu');
    expect(body.properties['Date de lecture'].rich_text[0].text.content).toBe('Juin 2024');
    expect(body.properties['Fiche de lecture'].rich_text[0].text.content).toBe('Ma fiche.');
    expect(body.properties['Collection (livre)'].checkbox).toBe(true);
  });

  test('FIELD_ID_TO_BOOK_KEY couvre tous les champs bibliographiques actifs par défaut', () => {
    expect(FIELD_ID_TO_BOOK_KEY['f-editeur']).toBe('editeur');
    expect(FIELD_ID_TO_BOOK_KEY['f-pages']).toBe('pages');
    expect(FIELD_ID_TO_BOOK_KEY['f-titre']).toBe('titre');
  });
});

// ─── sendBatch ──────────────────────────────────────────────────────────────

describe('sendBatch', () => {
  test('abandonne proprement si syncDatabaseProps échoue, sans envoyer aucun enregistrement', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const records = [{ book: { titre: 'T', auteur: 'A' }, pageId: null, manualEntry: false, sourceIds: {} }];
    const batch = await sendBatch(records, CFG, () => {});
    expect(batch.ok).toBe(false);
    expect(batch.results).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('envoie chaque enregistrement séquentiellement après synchronisation du schéma', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull }) // syncDatabaseProps
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'p1' }) }) // création
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'p2' }) }); // mise à jour

    const records = [
      { isbn: '111', book: { titre: 'T1', auteur: 'A1' }, pageId: null, manualEntry: false, sourceIds: {} },
      { isbn: '222', book: { titre: 'T2', auteur: 'A2' }, pageId: 'page-2', manualEntry: false, sourceIds: {} },
    ];
    const progressCalls = [];
    const batch = await sendBatch(records, CFG, (done, total) => progressCalls.push([done, total]));

    expect(batch.ok).toBe(true);
    expect(batch.results).toHaveLength(2);
    expect(batch.results.every(r => r.ok)).toBe(true);
    expect(progressCalls).toEqual([[1, 2], [2, 2]]);
  });
});
