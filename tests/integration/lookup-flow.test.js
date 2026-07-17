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

import { lookup } from '../../src/ui.js';

// DOM minimal nécessaire pour lookup() + fillForm()
const FORM_DOM = `
  <p id="status"></p>
  <div id="form-section" style="display:none">
    <p id="found-title"></p>
    <span id="source-badge"></span>
    <img id="cover-img" src="" style="display:none" />
    <input id="f-titre" />
    <input id="f-auteur" />
    <input id="f-editeur" />
    <input id="f-collection-ed" />
    <input id="f-isbn" />
    <input id="f-dateed" />
    <input id="f-pages" />
    <select id="f-theme"><option value="">— Thème —</option></select>
    <select id="f-soustheme"><option value="">— Sous-thème —</option></select>
    <select id="f-statut"><option value="À lire">À lire</option></select>
    <select id="f-priorite"><option value=""></option></select>
    <select id="f-datelu-mois"><option value=""></option></select>
    <select id="f-datelu-annee"><option value=""></option></select>
    <select id="f-note"><option value=""></option></select>
    <select id="f-etat"><option value=""></option></select>
    <input type="checkbox" id="f-collection" />
    <p id="collection-hint"></p>
    <textarea id="f-fiche"></textarea>
    <textarea id="f-citations"></textarea>
    <textarea id="f-comment"></textarea>
    <div id="datelu-block" class="hidden"></div>
    <div id="note-block" class="hidden"></div>
    <div id="priorite-block"></div>
  </div>
`;

beforeEach(() => {
  document.body.innerHTML = FORM_DOM;
  localStorage.clear();
  localStorage.setItem('search_engine', 'bnf');
  vi.stubGlobal('fetch', vi.fn());
});

// ─── Happy path BnF ──────────────────────────────────────────────────────────

describe('Happy path BnF', () => {
  test('remplit le formulaire et affiche la source BnF', async () => {
    fetch.mockResolvedValue({ ok: true, text: async () => bnfFound });
    await lookup('9782070360024');
    expect(document.getElementById('f-titre').value).toContain('Le Capital');
    expect(document.getElementById('f-auteur').value).toContain('Marx');
    expect(document.getElementById('source-badge').textContent).toContain('BnF');
    expect(document.getElementById('form-section').style.display).toBe('block');
    expect(document.getElementById('status').textContent).toBe('');
  });
});

// ─── Fallback BnF → OpenLibrary ──────────────────────────────────────────────

describe('Fallback BnF → OpenLibrary', () => {
  test('utilise OpenLibrary quand BnF ne trouve pas le livre', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty }) // BnF ISBN-13
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty }) // BnF ISBN-10
      .mockResolvedValueOnce({ ok: true, json: async () => olData })   // OpenLibrary
      .mockResolvedValue({ ok: false, headers: { get: () => '0' } });  // fetchCover HEAD
    await lookup('9782070360024');
    expect(document.getElementById('source-badge').textContent).toContain('OpenLibrary');
  });
});

// ─── Fallback complet → Google Books ─────────────────────────────────────────

describe('Fallback BnF → OL → Google', () => {
  test('utilise Google Books en dernier recours', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty })    // BnF ISBN-13
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty })    // BnF ISBN-10
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })        // OL ISBN-13 vide
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })        // OL ISBN-10 vide
      .mockResolvedValueOnce({ ok: true, json: async () => googleData })  // Google
      .mockResolvedValue({ ok: false, headers: { get: () => '0' } });     // fetchCover HEAD
    await lookup('9782070360024');
    expect(document.getElementById('source-badge').textContent).toContain('Google Books');
  });
});

// ─── ISBN invalide ────────────────────────────────────────────────────────────

describe('ISBN invalide', () => {
  test("affiche une erreur et ne contacte pas les APIs", async () => {
    await lookup('1234567890123');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).toContain('invalide');
  });

  test("ISBN vide → ne fait rien", async () => {
    await lookup('');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).toBe('');
  });
});

// ─── Toutes les sources échouent ─────────────────────────────────────────────

describe('Toutes les sources échouent', () => {
  test("affiche 'introuvable', formulaire affiché sans données", async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty })
      .mockResolvedValueOnce({ ok: true, text: async () => bnfEmpty })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValue({ ok: false, headers: { get: () => '0' } });
    await lookup('9782070360024');
    expect(document.getElementById('status').textContent).toContain('introuvable');
    expect(document.getElementById('f-titre').value).toBe('');
  });
});

// ─── Champ sélectionné absent de la 1ère source trouvée ──────────────────────

describe('Champ actif non fourni par la première source trouvée', () => {
  test('continue vers Google Books pour le Genre même si BnF a déjà rempli titre/auteur/éditeur/pages', async () => {
    localStorage.setItem('bib_fields', JSON.stringify(['editeur', 'collection', 'dateed', 'pages', 'couverture', 'categories']));
    fetch
      .mockResolvedValueOnce({ ok: true, text: async () => bnfFound })   // BnF ISBN-13 : trouve tout sauf Genre
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })      // OpenLibrary ISBN-13 (ne fournit pas Genre)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })      // OpenLibrary ISBN-10
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ volumeInfo: {
        title: 'Le Capital', authors: ['Karl Marx'], categories: ['Économie'],
      } }] }) })                                                        // Google Books : seule source du Genre
      .mockResolvedValue({ ok: false, headers: { get: () => '0' } });   // fetchCover HEAD
    await lookup('9782070360024');
    expect(document.getElementById('source-badge').textContent).toContain('BnF');
    expect(document.getElementById('source-badge').textContent).toContain('Google Books');
  });
});
