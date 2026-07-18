import { describe, test, expect } from 'vitest';
import { validateIsbn, isbn13to10, isbn10to13, isbnVariants, validateIssn, identifierType, validateIdentifier } from '../../src/isbn.js';

describe('validateIsbn', () => {
  test('ISBN-13 valide (Proust Pléiade)', () => {
    expect(validateIsbn('9782070360024')).toBe(true);
  });

  test('ISBN-13 valide (check digit = 0)', () => {
    expect(validateIsbn('9780306406157')).toBe(true);
  });

  test('ISBN-13 chiffre de contrôle incorrect', () => {
    expect(validateIsbn('9782070360025')).toBe(false);
  });

  test('ISBN-13 longueur incorrecte (12 chiffres)', () => {
    expect(validateIsbn('978207036002')).toBe(false);
  });

  test('ISBN-13 longueur incorrecte (14 chiffres)', () => {
    expect(validateIsbn('97820703600244')).toBe(false);
  });

  test('ISBN-10 valide', () => {
    expect(validateIsbn('2070360024')).toBe(true);
  });

  test('ISBN-10 chiffre de contrôle incorrect', () => {
    expect(validateIsbn('2070360025')).toBe(false);
  });

  test('Chaîne vide', () => {
    expect(validateIsbn('')).toBe(false);
  });
});

describe('isbn13to10', () => {
  test('conversion standard 978 → ISBN-10', () => {
    expect(isbn13to10('9782070360024')).toBe('2070360024');
  });

  test('résultat réel de la conversion (vérification checksum)', () => {
    const result = isbn13to10('9780306406157');
    expect(result).toHaveLength(10);
    expect(validateIsbn(result)).toBe(true);
  });

  test('préfixe 979 non convertible → null', () => {
    expect(isbn13to10('9791032343487')).toBe(null);
  });

  test('longueur incorrecte → null', () => {
    expect(isbn13to10('97820703600')).toBe(null);
  });

  test('chaîne vide → null', () => {
    expect(isbn13to10('')).toBe(null);
  });
});

describe('isbn10to13', () => {
  test('conversion standard ISBN-10 → 978', () => {
    expect(isbn10to13('2070360024')).toBe('9782070360024');
  });

  test('résultat réel de la conversion (vérification checksum)', () => {
    const result = isbn10to13('0306406152');
    expect(result).toHaveLength(13);
    expect(validateIsbn(result)).toBe(true);
  });

  test('longueur incorrecte → null', () => {
    expect(isbn10to13('207036002')).toBe(null);
  });

  test('chaîne vide → null', () => {
    expect(isbn10to13('')).toBe(null);
  });
});

describe('validateIssn', () => {
  test('ISSN valide (0395-2037, Le Monde)', () => {
    expect(validateIssn('03952037')).toBe(true);
  });

  test('ISSN valide avec chiffre de contrôle X (1050-124X)', () => {
    expect(validateIssn('1050124X')).toBe(true);
  });

  test('ISSN valide avec x minuscule accepté', () => {
    expect(validateIssn('1050124x')).toBe(true);
  });

  test('ISSN chiffre de contrôle incorrect', () => {
    expect(validateIssn('03952038')).toBe(false);
  });

  test('longueur incorrecte (7 chiffres) → false', () => {
    expect(validateIssn('3952037')).toBe(false);
  });

  test('longueur incorrecte (9 chiffres) → false', () => {
    expect(validateIssn('039520371')).toBe(false);
  });

  test('caractère non numérique dans les 7 premiers → false', () => {
    expect(validateIssn('039A2037')).toBe(false);
  });

  test('chaîne vide → false', () => {
    expect(validateIssn('')).toBe(false);
  });
});

describe('identifierType', () => {
  test('8 chiffres → issn', () => {
    expect(identifierType('03952037')).toBe('issn');
  });

  test('10 chiffres → isbn', () => {
    expect(identifierType('2070360024')).toBe('isbn');
  });

  test('13 chiffres → isbn', () => {
    expect(identifierType('9782070360024')).toBe('isbn');
  });

  test('longueur non reconnue → null', () => {
    expect(identifierType('123')).toBe(null);
  });
});

describe('validateIdentifier', () => {
  test('ISBN-13 valide reconnu', () => {
    expect(validateIdentifier('9782070360024')).toBe(true);
  });

  test('ISSN valide reconnu', () => {
    expect(validateIdentifier('03952037')).toBe(true);
  });

  test('ISSN avec chiffre de contrôle incorrect → false', () => {
    expect(validateIdentifier('03952038')).toBe(false);
  });

  test('longueur non reconnue → false', () => {
    expect(validateIdentifier('123')).toBe(false);
  });
});

describe('isbnVariants', () => {
  test('ISBN-13 → [ISBN-13, ISBN-10]', () => {
    expect(isbnVariants('9782070360024')).toEqual(['9782070360024', '2070360024']);
  });

  test('ISBN-10 → [ISBN-10, ISBN-13]', () => {
    expect(isbnVariants('2070360024')).toEqual(['2070360024', '9782070360024']);
  });

  test('ISBN-13 non convertible (préfixe 979) → une seule variante', () => {
    expect(isbnVariants('9791032343487')).toEqual(['9791032343487']);
  });

  test('longueur invalide → une seule variante (la valeur brute)', () => {
    expect(isbnVariants('123')).toEqual(['123']);
  });
});
