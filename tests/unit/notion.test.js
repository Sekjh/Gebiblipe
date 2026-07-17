// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures');

const dbFull          = JSON.parse(readFileSync(join(fixturesDir, 'notion-db-full.json'), 'utf8'));
const dbMissingAuteur = JSON.parse(readFileSync(join(fixturesDir, 'notion-db-missing-auteur.json'), 'utf8'));
const dbConflictPages = JSON.parse(readFileSync(join(fixturesDir, 'notion-db-conflict-pages.json'), 'utf8'));
const queryEmpty      = JSON.parse(readFileSync(join(fixturesDir, 'notion-query-empty.json'), 'utf8'));
const queryFound      = JSON.parse(readFileSync(join(fixturesDir, 'notion-query-found.json'), 'utf8'));
const queryTwo        = JSON.parse(readFileSync(join(fixturesDir, 'notion-query-two-results.json'), 'utf8'));

import {
  lookupFromNotion, syncDatabaseProps, doSend, updatePageFull, sendToNotion,
  setCurrentPageId, clearCurrentPageId, updateConfigWarning,
} from '../../src/notion.js';

const CFG = { token: 'ntn_x', dbId: 'abcdef1234567890abcdef1234567890', proxy: '' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  clearCurrentPageId();
});

// ─── lookupFromNotion ─────────────────────────────────────────────────────────

describe('lookupFromNotion', () => {
  test('retourne found: false sans appeler fetch quand token est vide', async () => {
    const result = await lookupFromNotion('9782070360024', { token: '', dbId: 'db123', proxy: '' });
    expect(result.found).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('retourne found: false sans appeler fetch quand dbId est vide', async () => {
    const result = await lookupFromNotion('9782070360024', { token: 'ntn_x', dbId: '', proxy: '' });
    expect(result.found).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('retourne found: false quand résultats vides', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryEmpty });
    const result = await lookupFromNotion('9999999999999', CFG);
    expect(result.found).toBe(false);
  });

  test('retourne found: true avec book et pageId quand page trouvée', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryFound });
    const result = await lookupFromNotion('9782070360024', CFG);
    expect(result.found).toBe(true);
    expect(result.pageId).toBe('page-abc-123');
    expect(result.book.titre).toBe('Le Capital');
    expect(result.book.auteur).toBe('Karl Marx');
    expect(result.book.pages).toBe('900');
    expect(result.book.theme).toBe('Histoire');
    expect(result.book.statut).toBe('Lu');
    expect(result.book.datem).toBe('Juin');
    expect(result.book.datey).toBe('2024');
    expect(result.book.couverture).toBe('https://covers.example.com/img.jpg');
    expect(result.book.fromNotion).toBe(true);
  });

  test('prend le plus ancien quand plusieurs résultats', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => queryTwo });
    const result = await lookupFromNotion('9782070360024', CFG);
    expect(result.found).toBe(true);
    expect(result.pageId).toBe('page-older-123');
    expect(result.book.titre).toBe('Le Capital — original');
  });

  test('retourne found: false sur erreur réseau (ne lève pas)', async () => {
    fetch.mockRejectedValueOnce(new Error('DNS failure'));
    const result = await lookupFromNotion('9782070360024', CFG);
    expect(result.found).toBe(false);
  });

  test('retourne found: false sur réponse HTTP non-ok', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const result = await lookupFromNotion('9782070360024', CFG);
    expect(result.found).toBe(false);
  });
});

// ─── syncDatabaseProps ────────────────────────────────────────────────────────

describe('syncDatabaseProps', () => {
  test("retourne ok: false avec 'introuvable' sur 404", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await syncDatabaseProps(CFG.token, CFG.dbId, { proxy: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('introuvable');
  });

  test("retourne ok: false avec 'invalide' sur 401", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const result = await syncDatabaseProps(CFG.token, CFG.dbId, { proxy: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalide');
  });

  test('retourne ok: false avec le message sur erreur réseau', async () => {
    fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await syncDatabaseProps(CFG.token, CFG.dbId, { proxy: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  test('retourne ok: true, created: [], conflicts: [] quand toutes les props sont correctes', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => dbFull });
    const result = await syncDatabaseProps(CFG.token, CFG.dbId, { proxy: '' });
    expect(result.ok).toBe(true);
    expect(result.created).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  test("crée la propriété manquante 'Auteur' via PATCH", async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbMissingAuteur })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await syncDatabaseProps(CFG.token, CFG.dbId, { proxy: '' });
    expect(result.ok).toBe(true);
    expect(result.created).toContain('Auteur');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
  });

  test("signale un conflit de type pour 'Pages' sans le modifier", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => dbConflictPages });
    const result = await syncDatabaseProps(CFG.token, CFG.dbId, { proxy: '' });
    expect(result.ok).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].name).toBe('Pages');
    expect(result.conflicts[0].expected).toBe('number');
    expect(result.conflicts[0].actual).toBe('rich_text');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── DOM commun aux tests doSend / updatePageFull / sendToNotion ──────────────

const DOM_FORM = `
  <input id="f-titre" value="Le Capital" />
  <input id="f-auteur" value="Karl Marx" />
  <input id="f-editeur" value="Éditions Sociales" />
  <input id="f-collection-ed" value="" />
  <input id="f-isbn" value="9782070360024" />
  <input id="f-dateed" value="1969" />
  <input id="f-pages" value="900" />
  <select id="f-theme"><option value="Histoire" selected>Histoire</option></select>
  <select id="f-soustheme"><option value="Histoire économique" selected>Histoire économique</option></select>
  <select id="f-statut"><option value="Lu" selected>Lu</option></select>
  <select id="f-priorite"><option value="" selected></option></select>
  <select id="f-datelu-mois"><option value="Juin" selected>Juin</option></select>
  <select id="f-datelu-annee"><option value="2024" selected>2024</option></select>
  <select id="f-note"><option value="★★★★★" selected>★★★★★</option></select>
  <select id="f-etat"><option value="" selected></option></select>
  <input type="checkbox" id="f-collection" />
  <textarea id="f-fiche">Ma note de lecture.</textarea>
  <textarea id="f-citations"></textarea>
  <textarea id="f-comment"></textarea>
  <img id="cover-img" src="" style="display:none" />
  <p id="notion-status"></p>
`;

// ─── doSend ──────────────────────────────────────────────────────────────────

describe('doSend', () => {
  beforeEach(() => {
    document.body.innerHTML = DOM_FORM;
    localStorage.removeItem('bib_fields');
  });

  test('envoie le bon payload shape à Notion', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.parent.database_id).toBe(CFG.dbId);
    expect(body.properties['Nom'].title[0].text.content).toBe('Le Capital');
    expect(body.properties['Auteur'].rich_text[0].text.content).toBe('Karl Marx');
    expect(body.properties['Pages'].number).toBe(900);
    expect(body.properties['Date de lecture'].rich_text[0].text.content).toBe('Juin 2024');
    expect(body.properties['Collection (livre)'].checkbox).toBe(false);
  });

  test("omet les props dont le nom est dans sync.conflicts", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [{ name: 'Pages' }] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Pages']).toBeUndefined();
  });

  test('inclut la couverture quand cover-img est visible avec un src', async () => {
    document.getElementById('cover-img').src = 'https://covers.example.com/img.jpg';
    document.getElementById('cover-img').style.display = 'block';
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.cover).toEqual({ type: 'external', external: { url: 'https://covers.example.com/img.jpg' } });
  });

  test("omet 'Priorité' quand le champ est vide", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Priorité']).toBeUndefined();
  });

  test("n'envoie ni 'Nationalité' ni 'Publication originale' (champs personnalisés supprimés)", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Nationalité']).toBeUndefined();
    expect(body.properties['Publication originale']).toBeUndefined();
  });

  test("omet un champ bibliographique désactivé (ex. Éditeur) au lieu de l'envoyer vide", async () => {
    localStorage.setItem('bib_fields', JSON.stringify(['pages']));
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Éditeur']).toBeUndefined();
    expect(body.properties['Pages'].number).toBe(900);
  });

  test("envoie 'Genre' en multi_select à partir d'une liste séparée par des virgules", async () => {
    localStorage.setItem('bib_fields', JSON.stringify(['categories']));
    document.body.insertAdjacentHTML('beforeend', '<input id="f-genre" value="Roman, Philosophie" />');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Genre'].multi_select).toEqual([{ name: 'Roman' }, { name: 'Philosophie' }]);
  });

  test("coche 'Collection (livre)' quand la case est cochée", async () => {
    document.getElementById('f-collection').checked = true;
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Collection (livre)'].checkbox).toBe(true);
  });

  test('affiche le message de succès dans notion-status', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await doSend(CFG, { created: [], conflicts: [] });
    expect(document.getElementById('notion-status').textContent).toContain('Ajouté dans Notion');
  });

  test('affiche une erreur Notion dans notion-status sur réponse non-ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Propriété inconnue' }),
    });
    await doSend(CFG, { created: [], conflicts: [] });
    expect(document.getElementById('notion-status').textContent).toContain('Propriété inconnue');
  });
});

// ─── updatePageFull ───────────────────────────────────────────────────────────

describe('updatePageFull', () => {
  beforeEach(() => {
    document.body.innerHTML = DOM_FORM;
  });

  test('envoie PATCH sur /v1/pages/{pageId} (pas de parent dans le body)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await updatePageFull('page-abc-123', CFG, { created: [], conflicts: [] });
    const [url, opts] = fetch.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(url).toContain('/v1/pages/page-abc-123');
    const body = JSON.parse(opts.body);
    expect(body.parent).toBeUndefined();
  });

  test('inclut les propriétés du formulaire dans le PATCH', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await updatePageFull('page-abc-123', CFG, { created: [], conflicts: [] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.properties['Nom'].title[0].text.content).toBe('Le Capital');
    expect(body.properties['Auteur'].rich_text[0].text.content).toBe('Karl Marx');
    expect(body.properties['Pages'].number).toBe(900);
  });

  test('affiche le message de succès dans notion-status', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await updatePageFull('page-abc-123', CFG, { created: [], conflicts: [] });
    expect(document.getElementById('notion-status').textContent).toContain('Mis à jour dans Notion');
  });
});

// ─── sendToNotion (routage _currentPageId) ────────────────────────────────────

describe('sendToNotion — routage', () => {
  beforeEach(() => {
    document.body.innerHTML = DOM_FORM;
    localStorage.clear();
    localStorage.setItem('notion_token', 'ntn_testtoken');
    localStorage.setItem('notion_dbid', 'abcdef1234567890abcdef1234567890');
    localStorage.setItem('notion_proxy', 'https://proxy.test');
    clearCurrentPageId();
  });

  test('sans _currentPageId → POST /v1/pages (création)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await sendToNotion();
    const postCall = fetch.mock.calls.find(c => c[1]?.method === 'POST' && c[0].includes('/v1/pages'));
    expect(postCall).toBeTruthy();
    expect(document.getElementById('notion-status').textContent).toContain('Ajouté dans Notion');
  });

  test('avec _currentPageId → PATCH /v1/pages/{id} (mise à jour)', async () => {
    setCurrentPageId('page-xyz-789');
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => dbFull })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await sendToNotion();
    const patchCall = fetch.mock.calls.find(c => c[1]?.method === 'PATCH' && c[0].includes('/v1/pages/page-xyz-789'));
    expect(patchCall).toBeTruthy();
    expect(document.getElementById('notion-status').textContent).toContain('Mis à jour dans Notion');
  });

  test("affiche un message de configuration quand le token est absent", async () => {
    localStorage.removeItem('notion_token');
    await sendToNotion();
    expect(document.getElementById('notion-status').textContent).toContain('Configure');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── updateConfigWarning ───────────────────────────────────────────────────────

describe('updateConfigWarning', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="btn-toggle-config">⚙ configuration</button>';
    localStorage.clear();
  });

  test('ajoute une pastille et un aria-label quand la configuration est incomplète', () => {
    updateConfigWarning();
    const btn = document.getElementById('btn-toggle-config');
    expect(document.getElementById('config-warn-dot')).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toContain('incomplète');
  });

  test("n'ajoute pas de pastille quand la configuration est complète", () => {
    localStorage.setItem('notion_token', 'ntn_testtoken');
    localStorage.setItem('notion_dbid', 'abcdef1234567890abcdef1234567890');
    localStorage.setItem('notion_proxy', 'https://proxy.test');
    updateConfigWarning();
    const btn = document.getElementById('btn-toggle-config');
    expect(document.getElementById('config-warn-dot')).toBeFalsy();
    expect(btn.hasAttribute('aria-label')).toBe(false);
  });

  test('retire la pastille et le aria-label une fois la configuration complétée', () => {
    updateConfigWarning();
    expect(document.getElementById('config-warn-dot')).toBeTruthy();

    localStorage.setItem('notion_token', 'ntn_testtoken');
    localStorage.setItem('notion_dbid', 'abcdef1234567890abcdef1234567890');
    localStorage.setItem('notion_proxy', 'https://proxy.test');
    updateConfigWarning();

    const btn = document.getElementById('btn-toggle-config');
    expect(document.getElementById('config-warn-dot')).toBeFalsy();
    expect(btn.hasAttribute('aria-label')).toBe(false);
  });
});
