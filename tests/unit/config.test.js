import { describe, test, expect, beforeEach, vi } from 'vitest';
import { localStorageStub } from '../helpers/localStorage.js';
import { getConfig, notionUrl, notionHeaders, getMissingConfigKeys } from '../../src/config.js';

beforeEach(() => {
  localStorageStub.clear();
  vi.stubGlobal('localStorage', localStorageStub);
});

describe('getConfig', () => {
  test('retourne des chaînes vides quand localStorage est vide', () => {
    const cfg = getConfig();
    expect(cfg.token).toBe('');
    expect(cfg.dbId).toBe('');
    expect(cfg.proxy).toBe('');
    expect(cfg.anthropicKey).toBe('');
  });

  test('lit les 4 valeurs depuis localStorage', () => {
    localStorage.setItem('notion_token',  'ntn_abc');
    localStorage.setItem('notion_dbid',   'db123');
    localStorage.setItem('notion_proxy',  'https://proxy.example.com');
    localStorage.setItem('anthropic_key', 'sk-ant-xyz');
    const cfg = getConfig();
    expect(cfg.token).toBe('ntn_abc');
    expect(cfg.dbId).toBe('db123');
    expect(cfg.proxy).toBe('https://proxy.example.com');
    expect(cfg.anthropicKey).toBe('sk-ant-xyz');
  });
});

describe('getMissingConfigKeys', () => {
  test('retourne les 3 clés requises quand tout manque', () => {
    expect(getMissingConfigKeys({ token: '', dbId: '', proxy: '' })).toEqual(['token', 'dbId', 'proxy']);
  });

  test("retourne un tableau vide quand tout est présent (anthropicKey non requis)", () => {
    expect(getMissingConfigKeys({ token: 'ntn_abc', dbId: 'db123', proxy: 'https://proxy.example.com' })).toEqual([]);
  });

  test('ne signale que la clé manquante', () => {
    expect(getMissingConfigKeys({ token: 'ntn_abc', dbId: '', proxy: 'https://proxy.example.com' })).toEqual(['dbId']);
  });

  test("l'absence d'anthropicKey n'est jamais signalée", () => {
    expect(getMissingConfigKeys({ token: 'ntn_abc', dbId: 'db123', proxy: 'https://proxy.example.com', anthropicKey: '' })).toEqual([]);
  });
});

describe('notionUrl', () => {
  test("utilise api.notion.com quand pas de proxy", () => {
    expect(notionUrl('/v1/pages', { proxy: '' })).toBe('https://api.notion.com/v1/pages');
  });

  test("utilise le proxy quand configuré", () => {
    expect(notionUrl('/v1/pages', { proxy: 'https://my.proxy.dev' }))
      .toBe('https://my.proxy.dev/v1/pages');
  });

  test("supprime le slash final du proxy", () => {
    expect(notionUrl('/v1/pages', { proxy: 'https://my.proxy.dev/' }))
      .toBe('https://my.proxy.dev/v1/pages');
  });
});

describe('notionHeaders', () => {
  test('retourne les 3 en-têtes requis', () => {
    const h = notionHeaders('ntn_mytoken');
    expect(h['Authorization']).toBe('Bearer ntn_mytoken');
    expect(h['Content-Type']).toBe('application/json');
    expect(h['Notion-Version']).toBe('2022-06-28');
  });
});
