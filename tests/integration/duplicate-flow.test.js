// @vitest-environment jsdom
// Anciennement "duplicate-flow" — teste désormais le flux Notion lookup + send
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const dbFull     = JSON.parse(readFileSync(join(fixturesDir, 'notion-db-full.json'), 'utf8'));
const queryEmpty = JSON.parse(readFileSync(join(fixturesDir, 'notion-query-empty.json'), 'utf8'));
const queryFound = JSON.parse(readFileSync(join(fixturesDir, 'notion-query-found.json'), 'utf8'));

import { sendToNotion, lookupFromNotion, setCurrentPageId, clearCurrentPageId } from '../../src/notion.js';
import { fillForm } from '../../src/ui.js';

const TOKEN = 'ntn_testtoken';
const DBID  = 'abcdef1234567890abcdef1234567890';

const FORM_DOM = `
  <input id="f-titre" value="Le Capital" />
  <input id="f-auteur" value="Karl Marx" />
  <input id="f-editeur" value="Éditions Sociales" />
  <input id="f-collection-ed" value="" />
  <input id="f-isbn" value="9782070360024" />
  <input id="f-dateed" value="1969" />
  <input id="f-pages" value="900" />
  <select id="f-theme"><option value="Histoire" selected>Histoire</option></select>
  <select id="f-soustheme"><option value="" selected></option></select>
  <select id="f-statut"><option value="Lu" selected>Lu</option></select>
  <select id="f-priorite"><option value="" selected></option></select>
  <select id="f-datelu-mois"><option value="Juin" selected>Juin</option></select>
  <select id="f-datelu-annee"><option value="2024" selected>2024</option></select>
  <select id="f-note"><option value="" selected></option></select>
  <select id="f-etat"><option value="" selected></option></select>
  <input type="checkbox" id="f-collection" />
  <textarea id="f-fiche"></textarea>
  <textarea id="f-citations"></textarea>
  <textarea id="f-comment"></textarea>
  <img id="cover-img" src="" style="display:none" />
  <p id="notion-status"></p>
  <div id="toast-container"></div>
`;

beforeEach(() => {
  document.body.innerHTML = FORM_DOM;
  localStorage.clear();
  localStorage.setItem('notion_token', TOKEN);
  localStorage.setItem('notion_dbid', DBID);
  localStorage.setItem('notion_proxy', 'https://proxy.test');
  clearCurrentPageId();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  clearCurrentPageId();
});

// ─── lookupFromNotion (intégration) ──────────────────────────────────────────

describe('lookupFromNotion — intégration', () => {
  test("retourne found: false quand l'ISBN est absent de Notion", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryEmpty });
    const result = await lookupFromNotion('9999999999999', { token: TOKEN, dbId: DBID, proxy: 'https://proxy.test' });
    expect(result.found).toBe(false);
  });

  test('retourne found: true avec toutes les données quand ISBN trouvé', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryFound });
    const result = await lookupFromNotion('9782070360024', { token: TOKEN, dbId: DBID, proxy: 'https://proxy.test' });
    expect(result.found).toBe(true);
    expect(result.book.titre).toBe('Le Capital');
    expect(result.book.fiche).toBe('Ma fiche de lecture.');
    expect(result.book.note).toBe('★★★★★');
  });
});

// ─── sendToNotion sans _currentPageId → création ─────────────────────────────

describe('sendToNotion — mode création (pas de _currentPageId)', () => {
  test("envoie POST /v1/pages quand l'ISBN n'est pas déjà dans Notion", async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await sendToNotion();
    expect(document.getElementById('toast-container').textContent).toContain('Ajouté dans Notion');
    const postCall = fetch.mock.calls.find(c => c[1]?.method === 'POST' && c[0].includes('/v1/pages'));
    expect(postCall).toBeTruthy();
  });
});

// ─── sendToNotion avec _currentPageId → mise à jour ──────────────────────────

describe('sendToNotion — mode mise à jour (avec _currentPageId)', () => {
  test('envoie PATCH /v1/pages/{id} quand _currentPageId est défini', async () => {
    setCurrentPageId('page-abc-123');
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await sendToNotion();
    expect(document.getElementById('toast-container').textContent).toContain('Mis à jour dans Notion');
    const patchCall = fetch.mock.calls.find(c => c[1]?.method === 'PATCH' && c[0].includes('/v1/pages/page-abc-123'));
    expect(patchCall).toBeTruthy();
  });
});

// ─── Credentials absents ─────────────────────────────────────────────────────

describe('Credentials absents', () => {
  test("affiche un message de configuration quand le token est absent", async () => {
    localStorage.removeItem('notion_token');
    await sendToNotion();
    expect(document.getElementById('toast-container').textContent).toContain('Configure');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── Vérification doublon au moment de l'envoi ───────────────────────────────
// Ces tests vérifient les blocs constitutifs du handler btn-send-notion :
// lookupFromNotion → doublon trouvé → setCurrentPageId → sendToNotion = PATCH

describe('Flux doublon send-time — blocs constitutifs', () => {
  test('lookupFromNotion retourne found:true avec pageId quand un doublon existe', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryFound });
    const result = await lookupFromNotion('9782070360024', { token: TOKEN, dbId: DBID, proxy: 'https://proxy.test' });
    expect(result.found).toBe(true);
    expect(result.pageId).toBeTruthy();
    expect(result.book.titre).toBe('Le Capital');
  });

  test('setCurrentPageId puis sendToNotion envoie PATCH (mise à jour complète)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    setCurrentPageId('page-doublon-xyz');
    await sendToNotion();
    expect(document.getElementById('toast-container').textContent).toContain('Mis à jour dans Notion');
    const patchCall = fetch.mock.calls.find(c => c[1]?.method === 'PATCH' && c[0].includes('/v1/pages/page-doublon-xyz'));
    expect(patchCall).toBeTruthy();
  });

  test('clearCurrentPageId puis sendToNotion envoie POST (nouvelle entrée)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    clearCurrentPageId();
    await sendToNotion();
    expect(document.getElementById('toast-container').textContent).toContain('Ajouté dans Notion');
    const postCall = fetch.mock.calls.find(c => c[1]?.method === 'POST' && c[0].includes('/v1/pages'));
    expect(postCall).toBeTruthy();
  });

  test('lookupFromNotion retourne found:false quand pas de doublon', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryEmpty });
    const result = await lookupFromNotion('9999999999999', { token: TOKEN, dbId: DBID, proxy: 'https://proxy.test' });
    expect(result.found).toBe(false);
  });
});

// ─── Identifiants pivots envoyés à Notion ────────────────────────────────────

describe('Envoi des identifiants pivots à Notion', () => {
  test('POST inclut les propriétés ARK BnF / OLID quand sourceIds est renseigné, omet les absents', async () => {
    document.body.innerHTML = FORM_DOM + `
      <p id="found-title"></p>
      <p id="source-badge"></p>
      <p id="collection-hint"></p>
      <div id="form-section"></div>
      <div id="datelu-block"></div>
      <div id="note-block"></div>
      <div id="priorite-block"></div>
    `;
    fillForm({
      isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', source: 'BnF ISBN-13',
      searchLog: [], fieldSources: {}, sourceIds: { ark: 'ark:/12148/cb31570438x', olid: 'OL123M' },
    });
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await sendToNotion();
    const postCall = fetch.mock.calls.find(c => c[1]?.method === 'POST' && c[0].includes('/v1/pages'));
    const body = JSON.parse(postCall[1].body);
    expect(body.properties['ARK BnF'].rich_text[0].text.content).toBe('ark:/12148/cb31570438x');
    expect(body.properties['OLID'].rich_text[0].text.content).toBe('OL123M');
    expect(body.properties['Google Volume ID']).toBeUndefined();
    expect(body.properties['OCLC']).toBeUndefined();
  });
});
