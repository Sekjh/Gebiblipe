import { describe, test, expect, beforeEach, vi } from 'vitest';
import { localStorageStub } from '../helpers/localStorage.js';
import { BIB_FIELDS, MANDATORY_FIELDS, PIVOT_FIELDS, PIVOT_IDENTIFIER_KEYS, getActiveBibFields } from '../../src/champs.js';

beforeEach(() => {
  localStorageStub.clear();
  vi.stubGlobal('localStorage', localStorageStub);
});

describe('BIB_FIELDS', () => {
  test('chaque champ a une clé unique et un id de formulaire unique', () => {
    const keys = BIB_FIELDS.map(f => f.key);
    const ids = BIB_FIELDS.map(f => f.id);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('seule "couverture" est marquée isCover, sans propriété Notion', () => {
    const covers = BIB_FIELDS.filter(f => f.isCover);
    expect(covers.map(f => f.key)).toEqual(['couverture']);
    expect(covers[0].notionProp).toBeNull();
  });

  test('"categories" (Genre) est de type Notion multi_select', () => {
    const genre = BIB_FIELDS.find(f => f.key === 'categories');
    expect(genre.notionType).toBe('multi_select');
    expect(genre.notionProp).toBe('Genre');
  });

  test("Titre et Auteur sont hors BIB_FIELDS (obligatoires, non désactivables)", () => {
    expect(BIB_FIELDS.some(f => f.key === 'titre')).toBe(false);
    expect(BIB_FIELDS.some(f => f.key === 'auteur')).toBe(false);
    expect(MANDATORY_FIELDS.map(f => f.key)).toEqual(['titre', 'auteur']);
  });

  test('chaque champ appartient à un cercle valide (1, 2 ou 3)', () => {
    for (const f of BIB_FIELDS) {
      expect([1, 2, 3]).toContain(f.circle);
    }
  });

  test('le tableau est trié par cercle croissant', () => {
    const circles = BIB_FIELDS.map(f => f.circle);
    const sorted = [...circles].sort((a, b) => a - b);
    expect(circles).toEqual(sorted);
  });

  test('"format" (Format / reliure) est un champ du cercle 2, décoché par défaut', () => {
    const format = BIB_FIELDS.find(f => f.key === 'format');
    expect(format).toBeDefined();
    expect(format.circle).toBe(2);
    expect(format.defaultOn).toBe(false);
    expect(format.notionProp).toBe('Format');
  });
});

describe('PIVOT_IDENTIFIER_KEYS', () => {
  test('liste les 4 identifiants pivots attendus', () => {
    expect(PIVOT_IDENTIFIER_KEYS.sort()).toEqual(['ark', 'googleVolumeId', 'oclc', 'olid'].sort());
  });
});

describe('PIVOT_FIELDS', () => {
  test('chaque identifiant pivot a un notionProp rich_text (envoyé à Notion quand disponible)', () => {
    for (const f of PIVOT_FIELDS) {
      expect(f.notionProp).toBeTruthy();
      expect(f.notionType).toBe('rich_text');
    }
  });

  test("aucun identifiant pivot n'a de circle (non configurable par checkbox)", () => {
    for (const f of PIVOT_FIELDS) {
      expect(f.circle).toBeUndefined();
    }
  });
});

describe('getActiveBibFields', () => {
  test('sans préférence enregistrée, retourne les champs defaultOn', () => {
    const active = getActiveBibFields().map(f => f.key);
    expect(active.sort()).toEqual(['collection', 'couverture', 'dateed', 'editeur', 'language', 'pages'].sort());
  });

  test('respecte la préférence enregistrée dans localStorage', () => {
    localStorage.setItem('bib_fields', JSON.stringify(['editeur', 'categories']));
    const active = getActiveBibFields().map(f => f.key);
    expect(active.sort()).toEqual(['categories', 'editeur'].sort());
  });

  test('ignore une valeur localStorage invalide (JSON corrompu) et retombe sur les défauts', () => {
    localStorage.setItem('bib_fields', 'pas-du-json');
    const active = getActiveBibFields().map(f => f.key);
    expect(active.sort()).toEqual(['collection', 'couverture', 'dateed', 'editeur', 'language', 'pages'].sort());
  });

  test('une liste vide désactive tous les champs bibliographiques', () => {
    localStorage.setItem('bib_fields', JSON.stringify([]));
    expect(getActiveBibFields()).toEqual([]);
  });
});
