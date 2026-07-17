import { describe, test, expect, beforeEach, vi } from 'vitest';
import { localStorageStub } from '../helpers/localStorage.js';
import { BIB_FIELDS, MANDATORY_FIELDS, getActiveBibFields } from '../../src/champs.js';

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
});

describe('getActiveBibFields', () => {
  test('sans préférence enregistrée, retourne les champs defaultOn', () => {
    const active = getActiveBibFields().map(f => f.key);
    expect(active.sort()).toEqual(['collection', 'couverture', 'dateed', 'editeur', 'pages'].sort());
  });

  test('respecte la préférence enregistrée dans localStorage', () => {
    localStorage.setItem('bib_fields', JSON.stringify(['editeur', 'categories']));
    const active = getActiveBibFields().map(f => f.key);
    expect(active.sort()).toEqual(['categories', 'editeur'].sort());
  });

  test('ignore une valeur localStorage invalide (JSON corrompu) et retombe sur les défauts', () => {
    localStorage.setItem('bib_fields', 'pas-du-json');
    const active = getActiveBibFields().map(f => f.key);
    expect(active.sort()).toEqual(['collection', 'couverture', 'dateed', 'editeur', 'pages'].sort());
  });

  test('une liste vide désactive tous les champs bibliographiques', () => {
    localStorage.setItem('bib_fields', JSON.stringify([]));
    expect(getActiveBibFields()).toEqual([]);
  });
});
