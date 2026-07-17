import { describe, test, expect, beforeEach, vi } from 'vitest';
import { localStorageStub } from '../helpers/localStorage.js';
import { THEMES, getExpectedProps, propSchema } from '../../src/themes.js';

beforeEach(() => {
  localStorageStub.clear();
  vi.stubGlobal('localStorage', localStorageStub);
});

describe('THEMES', () => {
  test('contient exactement 11 thèmes', () => {
    expect(Object.keys(THEMES).length).toBe(11);
  });

  test('contient les thèmes attendus', () => {
    expect(THEMES).toHaveProperty('Philosophie');
    expect(THEMES).toHaveProperty('Littérature');
    expect(THEMES).toHaveProperty('Histoire');
    expect(THEMES).toHaveProperty('Autre');
  });

  test('chaque valeur est un tableau de strings non vide', () => {
    for (const [, subs] of Object.entries(THEMES)) {
      expect(Array.isArray(subs)).toBe(true);
      expect(subs.length).toBeGreaterThan(0);
      for (const s of subs) expect(typeof s).toBe('string');
    }
  });

  test("THEMES['Autre'] contient exactement ['—']", () => {
    expect(THEMES['Autre']).toEqual(['—']);
  });
});

describe('getExpectedProps', () => {
  const ALLOWED_TYPES = ['rich_text', 'number', 'select', 'checkbox', 'multi_select'];

  test('avec la config par défaut (aucune préférence enregistrée), contient exactement 18 propriétés', () => {
    expect(Object.keys(getExpectedProps()).length).toBe(18);
  });

  test('tous les types sont parmi les 5 types Notion autorisés', () => {
    for (const type of Object.values(getExpectedProps())) {
      expect(ALLOWED_TYPES).toContain(type);
    }
  });

  test("'Pages' est de type 'number'", () => {
    expect(getExpectedProps()['Pages']).toBe('number');
  });

  test("'Collection (livre)' est de type 'checkbox'", () => {
    expect(getExpectedProps()['Collection (livre)']).toBe('checkbox');
  });

  test("'Auteur' est de type 'rich_text'", () => {
    expect(getExpectedProps()['Auteur']).toBe('rich_text');
  });

  test("'Statut' est de type 'select'", () => {
    expect(getExpectedProps()['Statut']).toBe('select');
  });

  test("ne contient ni 'Nationalité' ni 'Publication originale' (champs personnalisés supprimés)", () => {
    expect(getExpectedProps()).not.toHaveProperty('Nationalité');
    expect(getExpectedProps()).not.toHaveProperty('Publication originale');
  });

  test("un champ bibliographique désactivé disparaît de getExpectedProps()", () => {
    localStorage.setItem('bib_fields', JSON.stringify(['collection', 'pages', 'couverture']));
    const props = getExpectedProps();
    expect(props).not.toHaveProperty('Éditeur');
    expect(props).not.toHaveProperty('Date édition');
    expect(props).toHaveProperty('Collection');
    expect(props).toHaveProperty('Pages');
  });

  test("'Genre' (multi_select) n'apparaît que lorsque le champ est activé", () => {
    expect(getExpectedProps()).not.toHaveProperty('Genre');
    localStorage.setItem('bib_fields', JSON.stringify(['categories']));
    expect(getExpectedProps()['Genre']).toBe('multi_select');
  });
});

describe('propSchema', () => {
  test("rich_text → { rich_text: {} }", () => {
    expect(propSchema('rich_text')).toEqual({ rich_text: {} });
  });

  test("number → { number: { format: 'number' } }", () => {
    expect(propSchema('number')).toEqual({ number: { format: 'number' } });
  });

  test("select → { select: {} }", () => {
    expect(propSchema('select')).toEqual({ select: {} });
  });

  test("checkbox → { checkbox: {} }", () => {
    expect(propSchema('checkbox')).toEqual({ checkbox: {} });
  });

  test("multi_select → { multi_select: {} }", () => {
    expect(propSchema('multi_select')).toEqual({ multi_select: {} });
  });

  test("type inconnu → fallback { rich_text: {} }", () => {
    expect(propSchema('unknown')).toEqual({ rich_text: {} });
  });
});
