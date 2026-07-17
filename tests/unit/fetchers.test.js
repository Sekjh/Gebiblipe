// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const bnfFound  = readFileSync(join(fixturesDir, 'bnf-found.xml'),  'utf8');
const bnfEmpty  = readFileSync(join(fixturesDir, 'bnf-empty.xml'),  'utf8');
const sudocFound = readFileSync(join(fixturesDir, 'sudoc-found.xml'), 'utf8');
const sudocEmpty = readFileSync(join(fixturesDir, 'sudoc-empty.xml'), 'utf8');
const olData    = JSON.parse(readFileSync(join(fixturesDir, 'openlibrary-response.json'), 'utf8'));
const googleData = JSON.parse(readFileSync(join(fixturesDir, 'google-response.json'), 'utf8'));

import { fetchWithTimeout, fetchBnF, fetchOpenLibrary, fetchGoogle, fetchSudoc, fetchCover, resolveFromSources } from '../../src/fetchers.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// ─── fetchWithTimeout ────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  test('résout quand fetch répond dans le délai', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => 'bonjour' });
    const res = await fetchWithTimeout('https://example.com', {}, 5000);
    expect(await res.text()).toBe('bonjour');
  });

  test('annule la requête après le délai', async () => {
    vi.useFakeTimers();
    let capturedSignal;
    fetch.mockImplementation((_url, opts) => {
      capturedSignal = opts.signal;
      return new Promise(() => {});
    });
    const p = fetchWithTimeout('https://example.com', {}, 100);
    await vi.advanceTimersByTimeAsync(200);
    expect(capturedSignal.aborted).toBe(true);
    vi.useRealTimers();
    p.catch(() => {});
  });
});

// ─── fetchBnF ────────────────────────────────────────────────────────────────

describe('fetchBnF', () => {
  test('remplit b depuis XML BnF valide', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => bnfFound });
    const b = { isbn: '9782070360024' };
    await fetchBnF('9782070360024', b);
    expect(b.source).toBe('BnF ISBN-13');
    expect(b.titre).toContain('Le Capital');
    expect(b.auteur).toContain('Marx');
    expect(b.editeur).toBe('Éditions Sociales');
    expect(b.dateed).toBe('1969');
    expect(b.collection).toBe('Bibliothèque marxiste');
    expect(b.pages).toBe('900');
    expect(b.language).toBe('fr');
    expect(b.sourceIds.ark).toBe('https://catalogue.bnf.fr/ark:/12148/cb31570438x');
  });

  test('ne positionne pas b.source quand pas de <record>', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty });
    const b = { isbn: '9999999999999' };
    await fetchBnF('9999999999999', b);
    expect(b.source).toBeUndefined();
  });

  test('effectue 2 appels quand ISBN-13 échoue et ISBN-10 réussit', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty })
      .mockResolvedValueOnce({ ok: true, text: async () => bnfFound });
    const b = { isbn: '9782070360024' };
    await fetchBnF('9782070360024', b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(b.source).toBe('BnF ISBN-10');
  });

  test('ne lève pas d\'exception en cas d\'erreur réseau', async () => {
    fetch.mockRejectedValueOnce(new Error('DNS failure'));
    const b = { isbn: '9782070360024' };
    await expect(fetchBnF('9782070360024', b)).resolves.toBeUndefined();
    expect(b.source).toBeUndefined();
  });

  test('accepte un ISBN-10 en entrée (livre ancien) et retente en ISBN-13 si besoin', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty })
      .mockResolvedValueOnce({ ok: true, text: async () => bnfFound });
    const b = { isbn: '2070360024' };
    await fetchBnF('2070360024', b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(b.source).toBe('BnF ISBN-13');
  });
});

// ─── fetchSudoc ──────────────────────────────────────────────────────────────

describe('fetchSudoc', () => {
  test('remplit b depuis XML SUDOC valide', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => sudocFound });
    const b = { isbn: '9782070360024' };
    await fetchSudoc('9782070360024', b);
    expect(b.source).toBe('SUDOC ISBN-13');
    expect(b.titre).toBe("L'étranger");
    expect(b.auteur).toBe('Albert Camus');
    expect(b.editeur).toBe('Gallimard');
    expect(b.dateed).toBe('DL 1996');
    expect(b.collection).toBe('Collection Folio');
    expect(b.pages).toBe('1 vol. (185 p.)');
    expect(b.language).toBe('fr');
    expect(b.sourceIds.ppn).toBe('172258367');
  });

  test('ne positionne pas b.source quand pas de <record>', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => sudocEmpty });
    const b = { isbn: '9999999999999' };
    await fetchSudoc('9999999999999', b);
    expect(b.source).toBeUndefined();
  });

  test('effectue 2 appels quand ISBN-13 échoue et ISBN-10 réussit', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => sudocEmpty })
      .mockResolvedValueOnce({ ok: true, text: async () => sudocFound });
    const b = { isbn: '9782070360024' };
    await fetchSudoc('9782070360024', b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(b.source).toBe('SUDOC ISBN-10');
  });

  test('ne lève pas d\'exception en cas d\'erreur réseau', async () => {
    fetch.mockRejectedValueOnce(new Error('DNS failure'));
    const b = { isbn: '9782070360024' };
    await expect(fetchSudoc('9782070360024', b)).resolves.toBeUndefined();
    expect(b.source).toBeUndefined();
  });

  test('accepte un ISBN-10 en entrée (livre ancien) et retente en ISBN-13 si besoin', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => sudocEmpty })
      .mockResolvedValueOnce({ ok: true, text: async () => sudocFound });
    const b = { isbn: '2070360024' };
    await fetchSudoc('2070360024', b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(b.source).toBe('SUDOC ISBN-13');
  });
});

// ─── fetchOpenLibrary ────────────────────────────────────────────────────────

describe('fetchOpenLibrary', () => {
  test('remplit b depuis OpenLibrary', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => olData });
    const b = { isbn: '9782070360024' };
    await fetchOpenLibrary('9782070360024', b);
    expect(b.source).toBe('OpenLibrary ISBN-13');
    expect(b.titre).toBeTruthy();
    expect(b.auteur).toContain('Proust');
    expect(b.couverture).toContain('-M.');
    expect(b.language).toBe('fr');
    expect(b.sourceIds.olid).toBe('OL7358935M');
    expect(b.sourceIds.oclc).toBe('12345678');
  });

  test('ne positionne pas b.source quand la clé ISBN est absente', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const b = { isbn: '0000000000000' };
    await fetchOpenLibrary('0000000000000', b);
    expect(b.source).toBeUndefined();
  });

  test('ne lève pas d\'exception en cas d\'erreur réseau', async () => {
    fetch.mockRejectedValueOnce(new Error('timeout'));
    const b = { isbn: '9782070360024' };
    await expect(fetchOpenLibrary('9782070360024', b)).resolves.toBeUndefined();
  });

  test('accepte un ISBN-10 en entrée (livre ancien) et retente en ISBN-13 si besoin', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => olData });
    const b = { isbn: '2070360024' };
    await fetchOpenLibrary('2070360024', b);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(b.source).toBe('OpenLibrary ISBN-13');
  });
});

// ─── fetchGoogle ─────────────────────────────────────────────────────────────

describe('fetchGoogle', () => {
  test('remplit b depuis Google Books', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => googleData });
    const b = { isbn: '9782070360024' };
    await fetchGoogle('9782070360024', b);
    expect(b.source).toBe('Google Books');
    expect(b.titre).toBeTruthy();
    expect(b.couverture).toMatch(/^https:/);
    expect(b.language).toBe('fr');
    expect(b.sourceIds.googleVolumeId).toBe('abc123XYZ');
  });

  test('ne fait rien quand items est absent', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const b = { isbn: '9999999999999' };
    await fetchGoogle('9999999999999', b);
    expect(b.source).toBeUndefined();
  });

  test('ne fait rien quand items est un tableau vide', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    const b = { isbn: '9999999999999' };
    await fetchGoogle('9999999999999', b);
    expect(b.source).toBeUndefined();
  });
});

// ─── fetchCover ──────────────────────────────────────────────────────────────

describe('fetchCover', () => {
  test('retourne l\'URL quand content-length > 1000', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => '5000' },
    });
    const url = await fetchCover('9782070360024');
    expect(url).toMatch(/openlibrary\.org/);
  });

  test('retourne null quand content-length <= 1000 (image placeholder)', async () => {
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => '800' },
    });
    const url = await fetchCover('9782070360024');
    expect(url).toBeNull();
  });

  test('retourne null quand tous les appels HEAD échouent', async () => {
    fetch.mockRejectedValue(new Error('réseau'));
    const url = await fetchCover('9782070360024');
    expect(url).toBeNull();
  });

  test('retourne null quand content-length est null (utilise la valeur par défaut 9999 → > 1000)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
    });
    const url = await fetchCover('9782070360024');
    expect(url).toMatch(/openlibrary\.org/);
  });

  test('accepte un ISBN-10 en entrée et retente en ISBN-13 si besoin', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, headers: { get: () => '800' } })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => '5000' } });
    const url = await fetchCover('2070360024');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(url).toContain('9782070360024');
  });
});

// ─── resolveFromSources ────────────────────────────────────────────────────

describe('resolveFromSources', () => {
  test('interroge toutes les sources même quand tous les champs cibles sont déjà remplis (stopWhenComplete:false), et foundByAnySource reste vrai sans nouvelle contribution', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfFound })     // bnf
      .mockResolvedValueOnce({ ok: true, json: async () => olData })      // openlibrary
      .mockResolvedValueOnce({ ok: true, json: async () => googleData }) // google
      .mockResolvedValueOnce({ ok: true, text: async () => sudocFound }); // sudoc

    const activeKeys = new Set(['editeur', 'dateed', 'language', 'pages']);
    const current = {
      isbn: '9782070360024', source: 'Notion',
      titre: 'Titre déjà présent', auteur: 'Auteur déjà présent',
      editeur: 'Éditeur déjà présent', dateed: '2000', language: 'fr', pages: '300',
    };

    const result = await resolveFromSources('9782070360024', current, activeKeys, 'bnf', { stopWhenComplete: false });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.contributedFields).toEqual([]);
    expect(result.foundByAnySource).toBe(true);
    // jamais d'écrasement d'une valeur déjà présente
    expect(result.book.titre).toBe('Titre déjà présent');
    expect(result.book.editeur).toBe('Éditeur déjà présent');
    // identifiants pivots rafraîchis malgré des champs bibliographiques déjà complets
    expect(result.sourceIds.ark).toBeTruthy();
    expect(result.sourceIds.ppn).toBeTruthy();
    expect(result.sourceIds.olid).toBeTruthy();
    expect(result.sourceIds.googleVolumeId).toBeTruthy();
  });

  test('s\'arrête dès que tous les champs cibles sont remplis quand stopWhenComplete:true (comportement historique du formulaire unitaire)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => bnfFound });
    const activeKeys = new Set(['editeur', 'dateed', 'language', 'pages']);
    const empty = { isbn: '9782070360024', source: '' };

    const result = await resolveFromSources('9782070360024', empty, activeKeys, 'bnf', { stopWhenComplete: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.contributedFields).toContain('titre');
    expect(result.foundByAnySource).toBe(true);
  });

  test('foundByAnySource reste faux quand aucune source ne retrouve le livre', async () => {
    fetch.mockResolvedValue({ ok: true, text: async () => bnfEmpty, json: async () => ({}) });
    const activeKeys = new Set(['editeur']);
    const empty = { isbn: '9782070360024', source: '' };

    const result = await resolveFromSources('9782070360024', empty, activeKeys, 'bnf', { stopWhenComplete: false });

    expect(result.foundByAnySource).toBe(false);
    expect(result.contributedFields).toEqual([]);
    expect(result.book.titre).toBe('');
  });
});
