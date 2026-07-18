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
const bnfIssnFound = readFileSync(join(fixturesDir, 'bnf-issn-found.xml'), 'utf8');
const sudocIssnFound = readFileSync(join(fixturesDir, 'sudoc-issn-found.xml'), 'utf8');
const olData    = JSON.parse(readFileSync(join(fixturesDir, 'openlibrary-response.json'), 'utf8'));
const googleData = JSON.parse(readFileSync(join(fixturesDir, 'google-response.json'), 'utf8'));

import { fetchWithTimeout, fetchBnF, fetchBnfIssn, fetchOpenLibrary, fetchGoogle, fetchSudoc, fetchSudocIssn, fetchCover, openLibraryLargeCoverUrl, resolveFromSources } from '../../src/fetchers.js';

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

// ─── fetchBnfIssn / fetchSudocIssn ──────────────────────────────────────────
// Structure XML/UNIMARC identique à l'ISBN (vérifié en direct sur bib.issn/isn=), requête
// unique — pas de variantes 10/13 comme pour l'ISBN.

describe('fetchBnfIssn', () => {
  test('remplit b depuis XML BnF ISSN valide', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => bnfIssnFound });
    const b = { isbn: '03952037' };
    await fetchBnfIssn('03952037', b);
    expect(b.source).toBe('BnF ISSN');
    expect(b.titre).toContain('Le Monde');
    expect(b.editeur).toBe('Le Monde');
    // La notice source porte "1944-" (plage ouverte, toujours publié) — le tiret final est retiré
    // pour l'affichage (vérifié en direct : sans ce nettoyage, la date de parution s'affichait
    // avec un tiret final trompeur, lu comme une donnée tronquée).
    expect(b.dateed).toBe('1944');
    // 215$a d'un périodique porte une notation de volumes, jamais un nombre de pages — non assigné.
    expect(b.pages).toBe('');
    expect(b.sourceIds.ark).toBe('https://catalogue.bnf.fr/ark:/12148/cb34378825c');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('ne positionne pas b.source quand pas de <record>', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty });
    const b = { isbn: '99999999' };
    await fetchBnfIssn('99999999', b);
    expect(b.source).toBeUndefined();
  });

  test('ne lève pas d\'exception en cas d\'erreur réseau', async () => {
    fetch.mockRejectedValueOnce(new Error('DNS failure'));
    const b = { isbn: '03952037' };
    await expect(fetchBnfIssn('03952037', b)).resolves.toBeUndefined();
    expect(b.source).toBeUndefined();
  });
});

describe('fetchSudocIssn', () => {
  test('remplit b depuis XML SUDOC ISSN valide', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => sudocIssnFound });
    const b = { isbn: '03952037' };
    await fetchSudocIssn('03952037', b);
    expect(b.source).toBe('SUDOC ISSN');
    expect(b.titre).toBe('Le Monde');
    expect(b.editeur).toBe('Le Monde');
    // "1944-" (plage ouverte) → tiret final retiré ; 215$a = "vol." (notation de volumes, pas un
    // nombre de pages) → non assigné au champ Pages.
    expect(b.dateed).toBe('1944');
    expect(b.pages).toBe('');
    expect(b.sourceIds.ppn).toBe('039569357');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('ne positionne pas b.source quand pas de <record>', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: async () => sudocEmpty });
    const b = { isbn: '99999999' };
    await fetchSudocIssn('99999999', b);
    expect(b.source).toBeUndefined();
  });

  test('ne lève pas d\'exception en cas d\'erreur réseau', async () => {
    fetch.mockRejectedValueOnce(new Error('DNS failure'));
    const b = { isbn: '03952037' };
    await expect(fetchSudocIssn('03952037', b)).resolves.toBeUndefined();
    expect(b.source).toBeUndefined();
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
// covers.openlibrary.org ne renvoie jamais d'en-tête Content-Length (réponses chunked, vérifié en
// direct) : le discriminant fiable "vraie couverture vs. placeholder 1×1" est Content-Type, présent
// ("image/jpeg") uniquement pour une vraie image.

describe('fetchCover', () => {
  test('retourne l\'URL quand Content-Type: image/*', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h) => h === 'content-type' ? 'image/jpeg' : null },
    });
    const url = await fetchCover('9782070360024');
    expect(url).toMatch(/openlibrary\.org/);
  });

  test('retourne null quand Content-Type est absent (placeholder 1×1, HTTP 200)', async () => {
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
    });
    const url = await fetchCover('9782070360024');
    expect(url).toBeNull();
  });

  test('retourne null quand tous les appels HEAD échouent', async () => {
    fetch.mockRejectedValue(new Error('réseau'));
    const url = await fetchCover('9782070360024');
    expect(url).toBeNull();
  });

  test('retourne null quand res.ok est false même avec un Content-Type image', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      headers: { get: (h) => h === 'content-type' ? 'image/jpeg' : null },
    });
    const url = await fetchCover('9782070360024');
    expect(url).toBeNull();
  });

  test('accepte un ISBN-10 en entrée et retente en ISBN-13 si besoin', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, headers: { get: (h) => h === 'content-type' ? 'image/jpeg' : null } });
    const url = await fetchCover('2070360024');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(url).toContain('9782070360024');
  });

  test('essaie le candidat OLID après les candidats ISBN quand fourni', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // ISBN-13
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // ISBN-10
      .mockResolvedValueOnce({ ok: true, headers: { get: (h) => h === 'content-type' ? 'image/jpeg' : null } }); // OLID
    const url = await fetchCover('9782070360024', { olid: 'OL7358935M' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(url).toBe('https://covers.openlibrary.org/b/olid/OL7358935M-M.jpg');
  });

  test('sans ISBN, utilise uniquement le candidat OLID', async () => {
    fetch.mockResolvedValueOnce({ ok: true, headers: { get: (h) => h === 'content-type' ? 'image/jpeg' : null } });
    const url = await fetchCover('', { olid: 'OL7358935M' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://covers.openlibrary.org/b/olid/OL7358935M-M.jpg');
  });

  test('sans ISBN ni OLID, ne fait aucun appel réseau et retourne null', async () => {
    const url = await fetchCover('');
    expect(fetch).not.toHaveBeenCalled();
    expect(url).toBeNull();
  });
});

// ─── openLibraryLargeCoverUrl ───────────────────────────────────────────────
// Reconstruction pure (sans réseau) de l'URL -L à partir d'une couverture -S/-M déjà validée —
// OpenLibrary génère les 3 tailles depuis la même image stockée.

describe('openLibraryLargeCoverUrl', () => {
  test('reconstruit depuis l\'OLID quand connu, quelle que soit l\'URL -M d\'origine', () => {
    const url = openLibraryLargeCoverUrl('https://covers.openlibrary.org/b/isbn/9782070360024-M.jpg', 'OL7358935M');
    expect(url).toBe('https://covers.openlibrary.org/b/olid/OL7358935M-L.jpg');
  });

  test('sans OLID, remplace le suffixe -M par -L sur l\'URL existante', () => {
    const url = openLibraryLargeCoverUrl('https://covers.openlibrary.org/b/isbn/9782070360024-M.jpg');
    expect(url).toBe('https://covers.openlibrary.org/b/isbn/9782070360024-L.jpg');
  });

  test('sans OLID, remplace le suffixe -S par -L', () => {
    const url = openLibraryLargeCoverUrl('https://covers.openlibrary.org/b/id/15155844-S.jpg');
    expect(url).toBe('https://covers.openlibrary.org/b/id/15155844-L.jpg');
  });

  test('couverture non-OpenLibrary (ex. Google Books) retournée inchangée', () => {
    const url = openLibraryLargeCoverUrl('https://books.google.com/books/content?id=abc123', 'OL7358935M');
    expect(url).toBe('https://books.google.com/books/content?id=abc123');
  });

  test('URL vide/nulle → null', () => {
    expect(openLibraryLargeCoverUrl('')).toBeNull();
    expect(openLibraryLargeCoverUrl(null)).toBeNull();
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

  test('idType: "issn" n\'interroge que BnF et SUDOC (pas OpenLibrary/Google)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfIssnFound })
      .mockResolvedValueOnce({ ok: true, text: async () => sudocIssnFound });
    const activeKeys = new Set(['editeur', 'dateed']);
    const empty = { isbn: '03952037', source: '' };

    const result = await resolveFromSources('03952037', empty, activeKeys, 'bnf', { stopWhenComplete: false, idType: 'issn' });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.searchLog.map(e => e.source)).toEqual(['BnF ISSN', 'SUDOC ISSN']);
    expect(result.book.titre).toContain('Le Monde');
  });

  test('idType: "issn" respecte le moteur préféré "sudoc" en tête', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => sudocIssnFound })
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty });
    const activeKeys = new Set(['editeur', 'dateed']);
    const empty = { isbn: '03952037', source: '' };

    await resolveFromSources('03952037', empty, activeKeys, 'sudoc', { stopWhenComplete: false, idType: 'issn' });

    expect(fetch.mock.calls[0][0]).toContain('sudoc.abes.fr');
    expect(fetch.mock.calls[1][0]).toContain('catalogue.bnf.fr');
  });
});
