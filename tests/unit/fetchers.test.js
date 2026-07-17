// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const bnfFound  = readFileSync(join(fixturesDir, 'bnf-found.xml'),  'utf8');
const bnfEmpty  = readFileSync(join(fixturesDir, 'bnf-empty.xml'),  'utf8');
const olData    = JSON.parse(readFileSync(join(fixturesDir, 'openlibrary-response.json'), 'utf8'));
const googleData = JSON.parse(readFileSync(join(fixturesDir, 'google-response.json'), 'utf8'));

import { fetchWithTimeout, fetchBnF, fetchOpenLibrary, fetchGoogle, fetchCover } from '../../src/fetchers.js';

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
});
